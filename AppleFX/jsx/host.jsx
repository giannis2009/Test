/*
 * AppleFX - Premiere Pro host script (ExtendScript, ES3).
 *
 * The panel sends a "plan": for every selected clip a list of ops describing
 * keyframe tracks or static values. This file resolves the Premiere objects
 * (Motion, Opacity, Transform and standard effects), adds effects through the
 * QE DOM when needed and writes the keyframes.
 *
 * All public functions return a JSON string: { ok: true, ... } or { ok: false, error }.
 */

var AppleFX = (function () {
  var TPS = 254016000000; // Premiere ticks per second

  // ------------------------------------------------------------ JSON out
  function quote(s) {
    return '"' + String(s).replace(/[\\"\u0000-\u001f\u2028\u2029]/g, function (c) {
      var m = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
      if (m[c]) return m[c];
      var h = c.charCodeAt(0).toString(16);
      return '\\u' + ('0000' + h).slice(-4);
    }) + '"';
  }
  function str(v) {
    var t = typeof v, i, out, k;
    if (v === null || v === undefined) return 'null';
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return quote(v);
    if (t === 'object' && typeof v.length === 'number' && !(v instanceof String)) {
      out = [];
      for (i = 0; i < v.length; i++) out.push(str(v[i]));
      return '[' + out.join(',') + ']';
    }
    if (t === 'object') {
      out = [];
      for (k in v) if (v.hasOwnProperty(k) && typeof v[k] !== 'function') out.push(quote(k) + ':' + str(v[k]));
      return '{' + out.join(',') + '}';
    }
    return 'null';
  }
  function ok(data) { data = data || {}; data.ok = true; return str(data); }
  function fail(e) {
    var msg = (e && e.message) ? e.message : String(e);
    if (e && e.line) msg += ' (line ' + e.line + ')';
    return str({ ok: false, error: msg });
  }

  // ------------------------------------------------------------ sequence helpers
  function activeSeq() {
    if (!app.project) throw new Error('No project is open.');
    var s = app.project.activeSequence;
    if (!s) throw new Error('Open a sequence first.');
    return s;
  }
  function fpsOf(s) {
    var tb = Number(s.timebase);
    return tb > 0 ? TPS / tb : 30;
  }
  function frameSize(s) {
    var w = 1920, h = 1080;
    try { if (s.frameSizeHorizontal) { w = s.frameSizeHorizontal; h = s.frameSizeVertical; } } catch (e) {}
    if (!w) {
      try { var st = s.getSettings(); w = st.videoFrameWidth; h = st.videoFrameHeight; } catch (e2) {}
    }
    return [Number(w) || 1920, Number(h) || 1080];
  }
  function speedOf(clip) {
    var sp = 1;
    try { sp = clip.getSpeed(); } catch (e) {}
    return (sp && sp > 0) ? sp : 1;
  }
  function selectedClips(s) {
    var out = [], t, c, tr, clip;
    for (t = 0; t < s.videoTracks.numTracks; t++) {
      tr = s.videoTracks[t];
      for (c = 0; c < tr.clips.numItems; c++) {
        clip = tr.clips[c];
        if (clip && clip.isSelected()) out.push({ track: t, index: c, clip: clip });
      }
    }
    return out;
  }
  function getClip(s, track, index) {
    var tr = s.videoTracks[track];
    if (!tr) return null;
    return tr.clips[index] || null;
  }

  // Keyframe times are in the clip's media time: in-point + (sequence offset x speed).
  function kt(ctx, rel) {
    var t = new Time();
    t.ticks = String(Math.round(ctx.inTicks + rel * ctx.speed * TPS));
    return t;
  }

  // ------------------------------------------------------------ components
  var FX = {
    motion:    { match: ['AE.ADBE Motion', 'AE.ADBE Vector Motion'], names: ['Motion', 'Vector Motion'] },
    opacity:   { match: ['AE.ADBE Opacity'], names: ['Opacity'] },
    transform: { match: ['AE.ADBE Geometry2', 'AE.ADBE Geometry'], names: ['Transform'] },
    blur:      { match: ['AE.ADBE Gaussian Blur 2', 'AE.ADBE Gaussian Blur'], names: ['Gaussian Blur'] },
    crop:      { match: ['AE.ADBE AECrop', 'AE.ADBE Crop'], names: ['Crop'] },
    bright:    { match: ['AE.ADBE Brightness & Contrast 2', 'AE.ADBE Brightness & Contrast'], names: ['Brightness & Contrast'] },
    shadow:    { match: ['AE.ADBE Drop Shadow'], names: ['Drop Shadow'] },
    bw:        { match: ['AE.ADBE Black&White', 'AE.ADBE Black & White', 'PR.ADBE Black & White'], names: ['Black & White'] }
  };

  function inList(v, list) {
    for (var i = 0; i < list.length; i++) if (list[i] === v) return true;
    return false;
  }
  function findComp(clip, def) {
    var comps = clip.components, found = null, i, c;
    for (i = 0; i < comps.numItems; i++) {
      c = comps[i];
      if (!c) continue;
      if (inList(c.matchName, def.match) || inList(c.displayName, def.names)) found = c;
    }
    return found;
  }
  function findParam(comp, names, fallback) {
    var props = comp.properties, i, p;
    for (i = 0; i < props.numItems; i++) {
      p = props[i];
      if (p && inList(p.displayName, names)) return p;
    }
    return props[fallback] || null;
  }

  function qeClipFor(ctx) {
    app.enableQE();
    var qs = qe.project.getActiveSequence();
    if (!qs) return null;
    var qt = qs.getVideoTrackAt(ctx.track);
    if (!qt) return null;
    var ticks = String(ctx.clip.start.ticks), secs = ctx.clip.start.seconds;
    var n = qt.numItems, i, it, nth = -1, fallback = null;
    for (i = 0; i < n; i++) {
      it = qt.getItemAt(i);
      if (!it || it.type === 'Empty') continue;
      nth++;
      try {
        if (it.start && (String(it.start.ticks) === ticks || Math.abs(Number(it.start.secs) - secs) < 0.0005)) return it;
      } catch (e) {}
      if (nth === ctx.index) fallback = it;
    }
    return fallback;
  }

  function refresh(ctx) {
    var c = getClip(ctx.seq, ctx.track, ctx.index);
    if (c) ctx.clip = c;
    return ctx.clip;
  }

  // Return the effect component, adding it through the QE DOM if the clip doesn't have one yet.
  function ensureEffect(ctx, key) {
    var def = FX[key], comp = findComp(ctx.clip, def);
    if (comp) return comp;
    var qc = qeClipFor(ctx);
    if (!qc) throw new Error('Could not access clip "' + ctx.clip.name + '" to add ' + def.names[0] + '.');
    var fx = null, i;
    for (i = 0; i < def.names.length && !fx; i++) {
      try { fx = qe.project.getVideoEffectByName(def.names[i]); } catch (e) { fx = null; }
    }
    if (!fx) throw new Error('Effect "' + def.names[0] + '" is not available in this Premiere version.');
    var before = ctx.clip.components.numItems;
    qc.addVideoEffect(fx);
    refresh(ctx);
    var comps = ctx.clip.components;
    comp = findComp(ctx.clip, def) || (comps.numItems > before ? comps[comps.numItems - 1] : null);
    if (!comp) throw new Error('Adding "' + def.names[0] + '" failed.');
    if (key === 'blur') {
      // Repeat Edge Pixels: keeps frosted glass and blur transitions from getting dark edges.
      try { findParam(comp, ['Repeat Edge Pixels'], 2).setValue(true, true); } catch (e2) {}
    }
    return comp;
  }

  // ------------------------------------------------------------ parameters
  function valueAt(ctx, prm, rel) {
    try { if (prm.isTimeVarying()) return prm.getValueAtTime(kt(ctx, rel)); } catch (e) {}
    return prm.getValue();
  }

  function writeParam(ctx, prm, op, conv) {
    if (!prm) throw new Error('Parameter not found.');
    var i, n;
    if (op.keys) {
      if (prm.areKeyframesSupported && !prm.areKeyframesSupported()) throw new Error('"' + prm.displayName + '" does not support keyframes.');
      var half = 0.5 / ctx.fps;
      if (!prm.isTimeVarying()) {
        prm.setTimeVarying(true);
        // Start from a clean slate over the whole clip.
        try { prm.removeKeyRange(kt(ctx, -half), kt(ctx, ctx.dur + half), false); } catch (e0) {}
      } else if (op.clear) {
        try { prm.removeKeyRange(kt(ctx, op.clear[0] - half), kt(ctx, op.clear[1] + half), false); } catch (e1) {}
      }
      n = op.keys.length;
      for (i = 0; i < n; i++) {
        var tm = kt(ctx, op.keys[i][0]);
        prm.addKey(tm);
        prm.setValueAtKey(tm, conv(op.keys[i][1]), i === n - 1);
      }
    } else {
      if (prm.isTimeVarying()) prm.setTimeVarying(false);
      prm.setValue(conv(op.value), true);
    }
  }

  // Position may be normalized (0..1) or in pixels depending on component/version.
  function units(ctx, v) {
    if (Math.abs(v[0]) <= 4 && Math.abs(v[1]) <= 4) return [1, 1];
    return [ctx.size[0], ctx.size[1]];
  }

  function transformParams(ctx, comp) {
    return {
      position: findParam(comp, ['Position'], 1),
      scale: findParam(comp, ['Scale', 'Scale Height'], 3),
      rotation: findParam(comp, ['Rotation'], 7),
      opacity: findParam(comp, ['Opacity'], 8)
    };
  }

  function motionParam(ctx, op) {
    if (op.via === 'transform') return transformParams(ctx, ensureEffect(ctx, 'transform'))[op.t];
    if (op.t === 'opacity') {
      var oc = findComp(ctx.clip, FX.opacity);
      if (!oc) throw new Error('Clip has no Opacity component.');
      return findParam(oc, ['Opacity'], 0);
    }
    var mc = findComp(ctx.clip, FX.motion);
    if (!mc) throw new Error('Clip has no Motion component.');
    if (op.t === 'position') return findParam(mc, ['Position'], 0);
    if (op.t === 'scale') return findParam(mc, ['Scale'], 1);
    return findParam(mc, ['Rotation'], 4);
  }

  function runMotionOp(ctx, op) {
    var prm = motionParam(ctx, op);
    if (!prm) throw new Error(op.t + ' parameter not found.');
    var base = op.keys ? valueAt(ctx, prm, op.base || 0) : prm.getValue();
    var conv;
    if (op.t === 'position') {
      var u = units(ctx, base);
      var c = u[0] === 1 ? [0.5, 0.5] : [ctx.size[0] / 2, ctx.size[1] / 2];
      var o = op.mode === 'ident' ? c : [Number(base[0]), Number(base[1])];
      conv = function (d) { return [o[0] + d[0] * u[0], o[1] + d[1] * u[1]]; };
    } else if (op.t === 'rotation') {
      var br = op.mode === 'ident' ? 0 : Number(base);
      conv = function (d) { return br + d; };
    } else {
      // scale / opacity: multiplier of the current value, or of 100% for static looks
      var bm = op.mode === 'ident' ? 100 : Number(base);
      conv = function (m) { return bm * m; };
    }
    writeParam(ctx, prm, op, conv);
  }

  function ident(v) { return v; }

  function runOp(ctx, op) {
    refresh(ctx);
    switch (op.t) {
      case 'position': case 'scale': case 'rotation': case 'opacity':
        return runMotionOp(ctx, op);
      case 'fx': {
        var comp = ensureEffect(ctx, op.fx);
        return writeParam(ctx, comp.properties[op.p], op, ident);
      }
      case 'fxadd':
        ensureEffect(ctx, op.fx);
        return;
      case 'shadow': {
        var sc = ensureEffect(ctx, 'shadow');
        var col = findParam(sc, ['Shadow Color'], 0);
        try { col.setColorValue(255, op.color[0], op.color[1], op.color[2], true); } catch (e) {}
        var op1 = findParam(sc, ['Opacity'], 1);
        // Drop Shadow opacity is stored as 0..255 in some versions and 0..100 in others.
        var cur = Number(op1.getValue());
        var k = cur > 100 ? 2.55 : 1;
        writeParam(ctx, op1, { value: op.opacity * k }, ident);
        writeParam(ctx, findParam(sc, ['Direction'], 2), { value: op.direction }, ident);
        writeParam(ctx, findParam(sc, ['Distance'], 3), { value: op.distance }, ident);
        writeParam(ctx, findParam(sc, ['Softness'], 4), { value: op.softness }, ident);
        return;
      }
      case 'shutter': {
        var tc = ensureEffect(ctx, 'transform');
        try { findParam(tc, ["Use Composition's Shutter Angle"], 9).setValue(false, true); } catch (e3) {}
        try { findParam(tc, ['Shutter Angle'], 10).setValue(op.on ? op.angle : 0, true); } catch (e4) {}
        return;
      }
      case 'param': {
        var pc = ctx.clip.components[op.ci];
        if (!pc) throw new Error('Component ' + op.ci + ' not found.');
        return writeParam(ctx, pc.properties[op.pi], op, ident);
      }
    }
    throw new Error('Unknown op ' + op.t);
  }

  function makeCtx(s, track, index, clip) {
    return {
      seq: s, track: track, index: index, clip: clip,
      fps: fpsOf(s), size: frameSize(s),
      inTicks: Number(clip.inPoint.ticks), speed: speedOf(clip),
      dur: clip.end.seconds - clip.start.seconds
    };
  }

  // ------------------------------------------------------------ public API
  function ping() { return ok({ version: '1.0.0', app: app.version }); }

  function getContext() {
    try {
      var s = activeSeq(), sel = selectedClips(s), fr = frameSize(s), clips = [], i, c;
      for (i = 0; i < sel.length; i++) {
        c = sel[i].clip;
        clips.push({
          track: sel[i].track, index: sel[i].index, name: c.name,
          start: c.start.seconds, end: c.end.seconds, dur: c.end.seconds - c.start.seconds
        });
      }
      return ok({ sequence: s.name, fps: fpsOf(s), width: fr[0], height: fr[1], clips: clips });
    } catch (e) { return fail(e); }
  }

  function applyPlan(plan) {
    try {
      var s = activeSeq(), done = 0, keys = 0, warnings = [], i, j;
      for (i = 0; i < plan.clips.length; i++) {
        var pc = plan.clips[i], clip = getClip(s, pc.track, pc.index);
        if (!clip) { warnings.push('Clip on V' + (pc.track + 1) + ' #' + (pc.index + 1) + ' not found.'); continue; }
        var ctx = makeCtx(s, pc.track, pc.index, clip);
        for (j = 0; j < pc.ops.length; j++) {
          try {
            runOp(ctx, pc.ops[j]);
            if (pc.ops[j].keys) keys += pc.ops[j].keys.length;
          } catch (e) {
            warnings.push(clip.name + ': ' + (e.message || e));
          }
        }
        done++;
      }
      return ok({ clips: done, keys: keys, warnings: warnings });
    } catch (e2) { return fail(e2); }
  }

  function isNumeric(v) {
    if (typeof v === 'number') return isFinite(v);
    if (v && typeof v === 'object' && typeof v.length === 'number' && v.length >= 2 && v.length <= 3) {
      for (var i = 0; i < v.length; i++) if (typeof v[i] !== 'number') return false;
      return true;
    }
    return false;
  }

  // Keyframed numeric parameters of the selected clips (for the Easing category).
  function getKeyframes() {
    try {
      var s = activeSeq(), sel = selectedClips(s), out = [], i, ci, pi;
      for (i = 0; i < sel.length; i++) {
        var clip = sel[i].clip, ctx = makeCtx(s, sel[i].track, sel[i].index, clip), params = [];
        var comps = clip.components;
        for (ci = 0; ci < comps.numItems; ci++) {
          var comp = comps[ci];
          if (!comp) continue;
          for (pi = 0; pi < comp.properties.numItems; pi++) {
            var prm = comp.properties[pi];
            try {
              if (!prm || !prm.isTimeVarying()) continue;
              if (/colou?r/i.test(prm.displayName)) continue;
              var ks = prm.getKeys();
              if (!ks || ks.length < 2) continue;
              var list = [], good = true, k;
              for (k = 0; k < ks.length; k++) {
                var v = prm.getValueAtKey(ks[k]);
                if (!isNumeric(v)) { good = false; break; }
                var val = typeof v === 'number' ? v : [v[0], v[1]].concat(v.length > 2 ? [v[2]] : []);
                list.push([(Number(ks[k].ticks) - ctx.inTicks) / TPS / ctx.speed, val]);
              }
              if (good) params.push({ ci: ci, pi: pi, name: comp.displayName + ' > ' + prm.displayName, keys: list });
            } catch (e) {}
          }
        }
        out.push({ track: sel[i].track, index: sel[i].index, name: clip.name, params: params });
      }
      return ok({ fps: fpsOf(s), clips: out });
    } catch (e2) { return fail(e2); }
  }

  // Remove keyframes from Motion, Opacity and the Transform effect of the selected clips.
  function resetAnimation() {
    try {
      var s = activeSeq(), sel = selectedClips(s), n = 0, i;
      for (i = 0; i < sel.length; i++) {
        var ctx = makeCtx(s, sel[i].track, sel[i].index, sel[i].clip), list = [];
        var mc = findComp(ctx.clip, FX.motion), oc = findComp(ctx.clip, FX.opacity), tc = findComp(ctx.clip, FX.transform);
        if (mc) list.push([findParam(mc, ['Position'], 0), 0], [findParam(mc, ['Scale'], 1), 0], [findParam(mc, ['Rotation'], 4), 0]);
        if (oc) list.push([findParam(oc, ['Opacity'], 0), 100]);
        if (tc) {
          var tp = transformParams(ctx, tc);
          list.push([tp.position, 0], [tp.scale, 0], [tp.rotation, 0], [tp.opacity, 100]);
        }
        for (var j = 0; j < list.length; j++) {
          var prm = list[j][0];
          if (!prm || !prm.isTimeVarying()) continue;
          // Keep the value the clip settles on in the middle of its duration.
          var v = list[j][1] || valueAt(ctx, prm, ctx.dur / 2);
          prm.setTimeVarying(false);
          prm.setValue(v, true);
          n++;
        }
      }
      return ok({ clips: sel.length, params: n });
    } catch (e) { return fail(e); }
  }

  return {
    ping: ping,
    getContext: getContext,
    applyPlan: applyPlan,
    getKeyframes: getKeyframes,
    resetAnimation: resetAnimation
  };
})();
