/*
 * AppleFX — panel UI.
 */
(function () {
  'use strict';

  var AFX = window.AFX, Easing = AFX.Easing, Presets = AFX.Presets, Engine = AFX.Engine, Host = AFX.Host;
  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------ persisted state
  var STORE = 'applefx.v1';
  var state = { cat: 'text', sel: {}, settings: {}, search: '' };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) { state.cat = saved.cat || state.cat; state.sel = saved.sel || {}; state.settings = saved.settings || {}; }
  } catch (e) {}
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ cat: state.cat, sel: state.sel, settings: state.settings })); } catch (e) {}
  }

  function presetsIn(cat) { return Presets.PRESETS.filter(function (p) { return p.cat === cat; }); }
  function current() {
    var id = state.sel[state.cat], p = id && Presets.byId[id];
    if (!p || p.cat !== state.cat) p = presetsIn(state.cat)[0];
    return p;
  }
  function settingsOf(p) {
    var s = Engine.settingsFor(p, null), mine = state.settings[p.id] || {}, k;
    s.density = s.density || 'smart';
    s.bezier = (s.bezier || [0.25, 0.1, 0.25, 1]).slice();
    s.spring = (s.spring || [0.5, 0.8]).slice();
    for (k in mine) s[k] = mine[k];
    return s;
  }
  function setSetting(p, key, value) {
    var s = state.settings[p.id] || (state.settings[p.id] = {});
    var m = /^(\w+)\.(\d)$/.exec(key);
    if (m) {
      var arr = (s[m[1]] || settingsOf(p)[m[1]]).slice();
      arr[+m[2]] = value;
      s[m[1]] = arr;
    } else s[key] = value;
    save();
  }

  // ------------------------------------------------------------ preview
  var preview = new AFX.Preview($('preview'));
  preview.start();
  function updatePreview() {
    var p = current();
    preview.set(p, settingsOf(p));
    $('presetName').textContent = p.name;
    $('presetDesc').textContent = p.desc;
  }
  $('replay').addEventListener('click', function () { preview.replay(); });

  // ------------------------------------------------------------ tabs
  function renderTabs() {
    var el = $('tabs');
    el.innerHTML = '';
    Presets.CATEGORIES.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c.id === state.cat && !state.search));
      b.innerHTML = c.name + '<span class="count">' + presetsIn(c.id).length + '</span>';
      b.addEventListener('click', function () {
        state.cat = c.id; state.search = ''; $('search').value = '';
        save(); renderAll();
      });
      el.appendChild(b);
    });
  }

  // ------------------------------------------------------------ grid
  var hover = null;
  function thumb(canvas, p) {
    AFX.PreviewUtil.still(canvas, p, settingsOf(p));
  }
  function renderGrid() {
    var grid = $('grid'), q = state.search.trim().toLowerCase(), list;
    grid.innerHTML = '';
    if (q) {
      list = Presets.PRESETS.filter(function (p) {
        return (p.name + ' ' + p.desc + ' ' + p.cat).toLowerCase().indexOf(q) >= 0;
      });
      $('catHint').textContent = list.length + ' result' + (list.length === 1 ? '' : 's') + ' for "' + state.search.trim() + '"';
    } else {
      list = presetsIn(state.cat);
      $('catHint').textContent = Presets.CATEGORIES.filter(function (c) { return c.id === state.cat; })[0].hint;
    }
    if (!list.length) {
      grid.innerHTML = '<div class="empty">No presets found.</div>';
      return;
    }
    var cur = current();
    list.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'card';
      b.title = p.desc;
      b.setAttribute('aria-pressed', String(p.id === cur.id));
      var cv = document.createElement('canvas');
      cv.width = 240; cv.height = 135;
      b.appendChild(cv);
      if (q) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = p.cat;
        b.appendChild(tag);
      }
      var lb = document.createElement('div');
      lb.className = 'label';
      lb.textContent = p.name;
      b.appendChild(lb);
      b.addEventListener('click', function () {
        state.cat = p.cat; state.sel[p.cat] = p.id;
        if (state.search) { state.search = ''; $('search').value = ''; }
        save(); renderAll();
      });
      b.addEventListener('mouseenter', function () {
        if (p.kind === 'ease' || p.kind === 'static') return;
        stopHover();
        hover = new AFX.Preview(cv);
        hover.fit = function () {
          hover.off.width = hover.acc.width = cv.width;
          hover.off.height = hover.acc.height = cv.height;
        };
        hover.set(p, settingsOf(p));
        hover.start();
        hover.card = { cv: cv, p: p };
      });
      b.addEventListener('mouseleave', stopHover);
      grid.appendChild(b);
      thumb(cv, p);
    });
  }
  function stopHover() {
    if (!hover) return;
    hover.stop();
    var c = hover.card;
    hover = null;
    if (c) thumb(c.cv, c.p);
  }

  $('search').addEventListener('input', function (e) {
    state.search = e.target.value;
    renderTabs(); renderGrid();
  });

  // ------------------------------------------------------------ controls
  var CURVE_OPTIONS = Easing.CURVES.map(function (c) { return [c.id, c.name]; });

  function controlsFor(p, s) {
    var c = [], isGlass = p.cat === 'glass';
    function curveCustom() {
      if (s.curve === 'custom-bezier') bezierCtl();
      if (s.curve === 'custom-spring') springCtl();
    }
    function bezierCtl() {
      c.push({ t: 'range', key: 'bezier.0', label: 'x1', min: 0, max: 1, step: 0.01 });
      c.push({ t: 'range', key: 'bezier.1', label: 'y1', min: -1, max: 2, step: 0.01 });
      c.push({ t: 'range', key: 'bezier.2', label: 'x2', min: 0, max: 1, step: 0.01 });
      c.push({ t: 'range', key: 'bezier.3', label: 'y2', min: -1, max: 2, step: 0.01 });
    }
    function springCtl() {
      c.push({ t: 'range', key: 'spring.0', label: 'Response', min: 0.1, max: 2, step: 0.05, unit: 's' });
      c.push({ t: 'range', key: 'spring.1', label: 'Damping', min: 0.1, max: 1.5, step: 0.01 });
    }
    var curve = { t: 'select', key: 'curve', label: 'Curve', options: CURVE_OPTIONS };
    var duration = { t: 'range', key: 'duration', label: 'Duration', min: 0.1, max: 3, step: 0.05, unit: 's' };
    var intensity = { t: 'range', key: 'intensity', label: 'Intensity', min: 0, max: 200, step: 5, unit: '%' };
    var mblur = { t: 'toggle', key: 'motionBlur', label: 'Motion blur' };
    var density = { t: 'seg', key: 'density', label: 'Keyframes', options: [['smart', 'Smart'], ['full', 'Every frame']] };
    var glassCtl = function () {
      c.push({ t: 'range', key: 'blur', label: 'Frost', min: 0, max: 150, step: 1 });
      c.push({ t: 'range', key: 'tint', label: 'Tint', min: -60, max: 60, step: 1 });
      if (p.shadow) c.push({ t: 'range', key: 'shadow', label: 'Shadow', min: 0, max: 100, step: 1, unit: '%' });
    };

    if (p.kind === 'ease') {
      if (p.custom === 'bezier') bezierCtl();
      if (p.custom === 'spring') springCtl();
      c.push({ t: 'range', key: 'minGap', label: 'Min gap', min: 1, max: 10, step: 1, unit: ' fr' });
      c.push(density);
      c.push({ t: 'note', text: 'Replaces the motion between each pair of existing keyframes with this curve. Works on Motion, Opacity and effect parameters.' });
    } else if (p.kind === 'anim') {
      c.push(curve); curveCustom(); c.push(duration);
      if (!isGlass) c.push(intensity);
      c.push({ t: 'seg', key: 'where', label: 'Animate', options: [['in', 'In'], ['out', 'Out'], ['both', 'In + Out']] });
      if (isGlass) glassCtl();
      c.push(mblur); c.push(density);
    } else if (p.kind === 'transition') {
      c.push(curve); curveCustom(); c.push(duration); c.push(intensity); c.push(mblur); c.push(density);
    } else if (p.kind === 'loop') {
      c.push(intensity);
      c.push({ t: 'range', key: 'speed', label: 'Speed', min: 10, max: 300, step: 5, unit: '%' });
      c.push(mblur); c.push(density);
    } else if (p.kind === 'static') {
      if (isGlass) glassCtl();
      else if (p.shadow) c.push({ t: 'range', key: 'shadow', label: 'Shadow', min: 0, max: 100, step: 1, unit: '%' });
      else c.push({ t: 'note', text: 'One click, no settings needed.' });
    }
    return c;
  }

  function getVal(s, key) {
    var m = /^(\w+)\.(\d)$/.exec(key);
    return m ? s[m[1]][+m[2]] : s[key];
  }
  function fmt(v, ctl) {
    var d = ctl.step < 0.1 ? 2 : (ctl.step < 1 ? 1 : 0);
    return Number(v).toFixed(d) + (ctl.unit || '');
  }

  function renderControls() {
    var p = current(), s = settingsOf(p), host = $('controls');
    host.innerHTML = '';
    controlsFor(p, s).forEach(function (ctl) {
      if (ctl.t === 'note') {
        var n = document.createElement('p');
        n.className = 'note'; n.textContent = ctl.text;
        host.appendChild(n);
        return;
      }
      var row = document.createElement('div');
      row.className = 'row';
      var lab = document.createElement('label');
      lab.textContent = ctl.label;
      row.appendChild(lab);
      var v = getVal(s, ctl.key), val = document.createElement('span');
      val.className = 'val';

      if (ctl.t === 'range') {
        var r = document.createElement('input');
        r.type = 'range'; r.min = ctl.min; r.max = ctl.max; r.step = ctl.step; r.value = v;
        r.setAttribute('aria-label', ctl.label);
        val.textContent = fmt(v, ctl);
        r.addEventListener('input', function () {
          setSetting(p, ctl.key, parseFloat(r.value));
          val.textContent = fmt(r.value, ctl);
          updatePreview();
        });
        r.addEventListener('dblclick', function () {
          delete (state.settings[p.id] || {})[ctl.key.split('.')[0]];
          save(); renderControls(); updatePreview();
        });
        row.appendChild(r);
      } else if (ctl.t === 'select') {
        var sel = document.createElement('select');
        sel.setAttribute('aria-label', ctl.label);
        ctl.options.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o[0]; opt.textContent = o[1];
          if (o[0] === v) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function () {
          setSetting(p, ctl.key, sel.value);
          renderControls(); updatePreview();
        });
        row.appendChild(sel);
      } else if (ctl.t === 'seg') {
        var seg = document.createElement('div');
        seg.className = 'seg';
        ctl.options.forEach(function (o) {
          var b = document.createElement('button');
          b.textContent = o[1];
          b.setAttribute('aria-pressed', String(o[0] === v));
          b.addEventListener('click', function () {
            setSetting(p, ctl.key, o[0]);
            renderControls(); updatePreview();
          });
          seg.appendChild(b);
        });
        row.appendChild(seg);
      } else if (ctl.t === 'toggle') {
        var sw = document.createElement('button');
        sw.className = 'switch';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-label', ctl.label);
        sw.setAttribute('aria-checked', String(!!v));
        sw.addEventListener('click', function () {
          setSetting(p, ctl.key, !v);
          renderControls(); updatePreview();
        });
        row.appendChild(sw);
      }
      row.appendChild(val);
      host.appendChild(row);
    });
  }

  function renderAll() {
    stopHover();
    renderTabs(); renderGrid(); renderControls(); updatePreview();
  }

  // ------------------------------------------------------------ toast
  var toastTimer;
  function toast(msg, kind) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, kind === 'err' ? 5200 : 3200);
  }

  // ------------------------------------------------------------ selection status
  var busy = false, lastCtx = null;
  function describe(ctx) {
    if (!ctx || !ctx.ok) return ctx && ctx.error ? ctx.error : 'Premiere is not responding';
    var n = ctx.clips.length;
    if (!n) return 'Select clips in the timeline';
    return '<b>' + n + ' clip' + (n === 1 ? '' : 's') + '</b> selected · ' + ctx.width + '×' + ctx.height + ' · ' + (Math.round(ctx.fps * 100) / 100) + ' fps';
  }
  function refreshSelection() {
    if (busy || document.hidden) return Promise.resolve(lastCtx);
    return Host.call('getContext').then(function (ctx) {
      lastCtx = ctx;
      $('selection').innerHTML = describe(ctx);
      return ctx;
    });
  }
  setInterval(refreshSelection, 2000);
  window.addEventListener('focus', refreshSelection);

  // ------------------------------------------------------------ apply
  function planFor(p, s, ctx) {
    if (p.kind === 'transition') {
      return Engine.transitionRoles(ctx.clips).map(function (x) {
        return { track: x.clip.track, index: x.clip.index, ops: Engine.buildClip(p, s, x.clip, ctx.fps, x.role) };
      });
    }
    return ctx.clips.map(function (c) {
      return { track: c.track, index: c.index, ops: Engine.buildClip(p, s, c, ctx.fps) };
    });
  }

  function report(res, what) {
    if (!res || !res.ok) return toast((res && res.error) || 'Something went wrong.', 'err');
    if (res.warnings && res.warnings.length) {
      toast(what + ' with ' + res.warnings.length + ' warning' + (res.warnings.length === 1 ? '' : 's') + ': ' + res.warnings[0], 'err');
      if (window.console) console.warn('[AppleFX]', res.warnings);
    } else {
      toast(what + ' to ' + res.clips + ' clip' + (res.clips === 1 ? '' : 's') + (res.keys ? ' · ' + res.keys + ' keyframes' : ''), 'ok');
    }
  }

  function setBusy(b) {
    busy = b;
    $('apply').disabled = b; $('reset').disabled = b;
    $('apply').textContent = b ? 'Applying…' : 'Apply';
  }

  $('apply').addEventListener('click', function () {
    var p = current(), s = settingsOf(p);
    setBusy(true);
    Host.call('getContext').then(function (ctx) {
      if (!ctx.ok) throw new Error(ctx.error);
      if (!ctx.clips.length) throw new Error('Select one or more clips in the timeline first.');
      if (p.kind === 'ease') {
        return Host.call('getKeyframes').then(function (kf) {
          if (!kf.ok) throw new Error(kf.error);
          var clips = kf.clips.map(function (c) {
            return { track: c.track, index: c.index, ops: Engine.bakeExisting(c.params, s, kf.fps) };
          }).filter(function (c) { return c.ops.length; });
          if (!clips.length) throw new Error('No keyframe pairs found. Add at least two keyframes (Position, Scale, Opacity, ...) to the selected clips.');
          return Host.call('applyPlan', { clips: clips });
        });
      }
      return Host.call('applyPlan', { clips: planFor(p, s, ctx) });
    }).then(function (res) {
      report(res, p.name + ' applied');
    }).catch(function (e) {
      toast(e.message || String(e), 'err');
    }).then(function () {
      setBusy(false);
      refreshSelection();
    });
  });

  $('reset').addEventListener('click', function () {
    setBusy(true);
    Host.call('resetAnimation').then(function (res) {
      if (!res.ok) throw new Error(res.error);
      toast(res.clips ? 'Cleared keyframes on ' + res.clips + ' clip' + (res.clips === 1 ? '' : 's') : 'Select clips to clear.', res.clips ? 'ok' : null);
    }).catch(function (e) {
      toast(e.message || String(e), 'err');
    }).then(function () { setBusy(false); });
  });

  // ------------------------------------------------------------ boot
  var pill = $('hostPill');
  if (Host.inHost) { pill.textContent = 'Premiere Pro'; pill.className = 'pill live'; }
  else { pill.textContent = 'Preview mode'; pill.className = 'pill mock'; pill.title = 'Running outside Premiere Pro: applying is simulated.'; }

  window.addEventListener('resize', function () { preview.fit(); });
  renderAll();
  refreshSelection();
})();
