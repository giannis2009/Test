/*
 * AppleFX — live preview.
 * Renders a preset on a canvas with the exact same state functions the engine
 * bakes into keyframes, including an approximation of Transform motion blur.
 */
(function (root) {
  'use strict';

  var Easing = root.AFX.Easing, Engine = root.AFX.Engine;
  var REF_W = 1920;

  // ------------------------------------------------------------ scene painters
  function photoA(g, W, H) {
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#3a1c71'); sky.addColorStop(0.55, '#d76d77'); sky.addColorStop(1, '#ffaf7b');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe29f';
    g.beginPath(); g.arc(W * 0.66, H * 0.56, H * 0.16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a2a6b';
    g.beginPath(); g.moveTo(0, H * 0.72);
    g.bezierCurveTo(W * 0.25, H * 0.52, W * 0.45, H * 0.8, W * 0.7, H * 0.66);
    g.bezierCurveTo(W * 0.85, H * 0.58, W * 0.95, H * 0.7, W, H * 0.64);
    g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.fillStyle = '#23123a';
    g.beginPath(); g.moveTo(0, H * 0.86);
    g.bezierCurveTo(W * 0.3, H * 0.74, W * 0.6, H * 0.95, W, H * 0.8);
    g.lineTo(W, H); g.lineTo(0, H); g.fill();
  }

  function photoB(g, W, H) {
    var bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b2545'); bg.addColorStop(1, '#13315c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var blobs = [[0.22, 0.35, 0.26, '#ff5e62'], [0.72, 0.3, 0.22, '#00c6ff'], [0.55, 0.78, 0.28, '#f9d423'], [0.1, 0.9, 0.18, '#7f00ff']];
    blobs.forEach(function (b) {
      g.fillStyle = b[3];
      g.beginPath(); g.arc(W * b[0], H * b[1], H * b[2], 0, Math.PI * 2); g.fill();
    });
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(1, W / 160);
    for (var i = -4; i < 14; i++) {
      g.beginPath(); g.moveTo(i * W / 10, 0); g.lineTo(i * W / 10 + H * 0.6, H); g.stroke();
    }
  }

  function backdrop(g, W, H) {
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#101014'); bg.addColorStop(1, '#1d1d27');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var rg = g.createRadialGradient(W * 0.5, H * 0.55, 0, W * 0.5, H * 0.55, W * 0.5);
    rg.addColorStop(0, 'rgba(10,132,255,0.28)'); rg.addColorStop(1, 'rgba(10,132,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }

  function title(g, W, H) {
    g.fillStyle = '#f5f5f7';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 ' + Math.round(H * 0.16) + 'px -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
    g.fillText('Hello, world.', W / 2, H / 2);
    g.fillStyle = 'rgba(245,245,247,0.6)';
    g.font = '500 ' + Math.round(H * 0.055) + 'px -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif';
    g.fillText('Made with AppleFX', W / 2, H / 2 + H * 0.14);
  }

  function black(g, W, H) { g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, W, H); }

  // ------------------------------------------------------------ layer rendering
  function Preview(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.off = document.createElement('canvas');
    this.acc = document.createElement('canvas');
    this.running = false;
    this.paused = false;
    this.t0 = 0;
    this._tick = this._tick.bind(this);
  }

  Preview.prototype.fit = function () {
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var w = Math.max(80, Math.round(this.canvas.clientWidth * dpr)), h = Math.round(w * 9 / 16);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    [this.off, this.acc].forEach(function (c) { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } });
  };

  Preview.prototype.set = function (preset, settings) {
    this.preset = preset;
    this.settings = Engine.settingsFor(preset, settings);
    this.r = preset.kind === 'ease' ? null : Engine.resolve(preset, settings);
    this.timeline = buildTimeline(this);
    this.t0 = now();
    this.fit();
    this.render(0);
  };

  Preview.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.t0 = now();
    root.requestAnimationFrame(this._tick);
  };
  Preview.prototype.stop = function () { this.running = false; };
  Preview.prototype.replay = function () { this.t0 = now(); };

  Preview.prototype._tick = function () {
    if (!this.running) return;
    if (this.timeline && !this.paused) {
      this.fit();
      var t = ((now() - this.t0) / 1000) % this.timeline.length;
      this.render(t);
    }
    root.requestAnimationFrame(this._tick);
  };

  Preview.prototype.render = function (t) {
    var W = this.canvas.width, H = this.canvas.height, g = this.ctx;
    if (!this.timeline) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.filter = 'none';
    if (this.preset.kind === 'ease') return drawEase(this, g, W, H, t);
    var frame = this.timeline.at(t);
    frame.bg(g, W, H);
    var mb = this.settings.motionBlur && this.preset.kind !== 'static';
    for (var i = 0; i < frame.layers.length; i++) {
      var L = frame.layers[i];
      if (mb && L.stateAt) this.drawBlurred(g, W, H, L, t);
      else this.drawLayer(g, W, H, L, L.st);
    }
  };

  // Draw layer content into the offscreen canvas with blur / crop / brightness applied.
  Preview.prototype.prepare = function (W, H, L, st) {
    var o = this.off.getContext('2d'), f = [];
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, W, H);
    if (st.blur > 0.05) f.push('blur(' + (st.blur * W / REF_W).toFixed(2) + 'px)');
    if (st.bright) f.push('brightness(' + Math.max(0, 1 + st.bright / 100).toFixed(3) + ')');
    if (L.bw) f.push('grayscale(1)');
    o.filter = f.length ? f.join(' ') : 'none';
    L.paint(o, W, H);
    o.filter = 'none';
    if (st.cl > 0) o.clearRect(0, 0, W * st.cl / 100, H);
    if (st.cr > 0) o.clearRect(W * (1 - st.cr / 100), 0, W * st.cr / 100, H);
    if (st.ct > 0) o.clearRect(0, 0, W, H * st.ct / 100);
    if (st.cb > 0) o.clearRect(0, H * (1 - st.cb / 100), W, H * st.cb / 100);
    return this.off;
  };

  function applyTransform(g, W, H, st) {
    g.translate(W / 2 + st.tx * W, H / 2 + st.ty * H);
    g.rotate(st.r * Math.PI / 180);
    g.scale(st.s, st.s);
    g.translate(-W / 2, -H / 2);
  }

  function applyShadow(g, W, H, sh) {
    if (!sh || !(sh.opacity > 0)) return;
    var k = W / REF_W, a = sh.direction * Math.PI / 180;
    g.shadowColor = 'rgba(0,0,0,' + (sh.opacity / 100).toFixed(3) + ')';
    g.shadowBlur = sh.softness * k;
    g.shadowOffsetX = Math.sin(a) * sh.distance * k;
    g.shadowOffsetY = -Math.cos(a) * sh.distance * k;
  }

  Preview.prototype.drawLayer = function (g, W, H, L, st) {
    if (st.o <= 0.001) return;
    var img = this.prepare(W, H, L, st);
    g.save();
    g.globalAlpha = Math.min(1, st.o);
    applyTransform(g, W, H, st);
    applyShadow(g, W, H, L.shadow);
    g.drawImage(img, 0, 0);
    g.restore();
  };

  // Motion blur: average sub-frame samples over a 180° shutter at 30 fps.
  Preview.prototype.drawBlurred = function (g, W, H, L, t) {
    var N = 8, shutter = 1 / 60, a = this.acc.getContext('2d'), i;
    var s0 = L.stateAt(t), s1 = L.stateAt(Math.max(0, t - shutter));
    var move = Math.abs(s0.tx - s1.tx) * W + Math.abs(s0.ty - s1.ty) * H + Math.abs(s0.s - s1.s) * W + Math.abs(s0.r - s1.r) * 8;
    if (move < 1) return this.drawLayer(g, W, H, L, s0);
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalCompositeOperation = 'source-over';
    a.clearRect(0, 0, W, H);
    a.globalCompositeOperation = 'lighter';
    for (i = 0; i < N; i++) {
      var st = L.stateAt(t - shutter * i / (N - 1));
      if (st.o <= 0.001) continue;
      var img = this.prepare(W, H, L, st);
      a.save();
      a.globalAlpha = Math.min(1, st.o) / N;
      applyTransform(a, W, H, st);
      a.drawImage(img, 0, 0);
      a.restore();
    }
    a.globalCompositeOperation = 'source-over';
    g.save();
    applyShadow(g, W, H, L.shadow);
    g.drawImage(this.acc, 0, 0);
    g.restore();
  };

  // ------------------------------------------------------------ timelines
  function now() { return (root.performance && performance.now) ? performance.now() : Date.now(); }

  function buildTimeline(pv) {
    var p = pv.preset, r = pv.r, s = pv.settings;
    if (p.kind === 'ease') return { length: 0.5 + 1.2 + 0.9 };

    var cat = p.cat, bg, paint;
    if (cat === 'text') { bg = backdrop; paint = title; }
    else if (cat === 'glass') { bg = photoB; paint = photoB; }
    else { bg = black; paint = photoA; }
    var shadow = r.shadow, bw = r.bw;
    function layer(fn, pnt) {
      return { paint: pnt || paint, shadow: shadow, bw: bw, stateAt: fn, st: null };
    }
    function frame(layers) {
      return { bg: bg, layers: layers };
    }

    if (p.kind === 'static') {
      return { length: 10, at: function () { var L = layer(null); L.st = r.rest; return frame([L]); } };
    }

    if (p.kind === 'loop') {
      var len = 6;
      var fnL = function (t) { return Engine.stateLoop(r, ((t % len) + len) % len, len, 1); };
      return { length: len, at: function (t) { var L = layer(fnL); L.st = fnL(t); return frame([L]); } };
    }

    var d = r.duration;
    if (p.kind === 'transition') {
      var hold = 0.7, total = hold + 2 * d + 1.0;
      var fnA = function (t) { return t < hold ? r.rest : Engine.stateOut(r, (t - hold) / d); };
      var fnB = function (t) { return Engine.stateIn(r, (t - hold - d) / d); };
      return {
        length: total,
        at: function (t) {
          if (t < hold + d) { var A = layer(fnA, photoA); A.st = fnA(t); return frame([A]); }
          var B = layer(fnB, photoB); B.st = fnB(t); return frame([B]);
        }
      };
    }

    // anim
    var w = s.where || 'in', pre = 0.35, rest = 1.1, post = 0.6;
    var doIn = w === 'in' || w === 'both', doOut = w === 'out' || w === 'both';
    var tIn = doIn ? pre : 0, tRest = tIn + (doIn ? d : 0), tOut = tRest + rest, tEnd = tOut + (doOut ? d : 0);
    var fn = function (t) {
      if (doIn && t < tRest) return Engine.stateIn(r, (t - tIn) / d);
      if (t < tOut || !doOut) return r.rest;
      return Engine.stateOut(r, (t - tOut) / d);
    };
    return {
      length: tEnd + post,
      at: function (t) {
        var L = layer(fn);
        L.st = fn(t);
        return frame([L]);
      }
    };
  }

  // ------------------------------------------------------------ easing graph
  function drawEase(pv, g, W, H, t) {
    var s = pv.settings;
    var f = Easing.make(s.curve, s.edit);
    black(g, W, H);
    var pad = H * 0.12, gx = pad * 1.2, gy = pad, gw = W * 0.5 - gx, gh = H - pad * 2;
    var lo = -0.15, hi = 1.3;
    function Y(v) { return gy + gh - (v - lo) / (hi - lo) * gh; }
    // grid
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
    g.strokeRect(gx, Y(1), gw, Y(0) - Y(1));
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(gx, Y(0)); g.lineTo(gx + gw, Y(1)); g.stroke();
    g.setLineDash([]);
    // curve
    g.strokeStyle = '#0a84ff'; g.lineWidth = Math.max(2, W / 220);
    g.beginPath();
    for (var i = 0; i <= 120; i++) {
      var p = i / 120, x = gx + p * gw, y = Y(f(p));
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
    // playhead
    var pp = Easing.clamp((t - 0.5) / 1.2, 0, 1), e = f(pp);
    g.fillStyle = '#f5f5f7';
    g.beginPath(); g.arc(gx + pp * gw, Y(e), Math.max(3, W / 110), 0, Math.PI * 2); g.fill();
    // moving object
    var tx0 = W * 0.58, tx1 = W * 0.9, sz = H * 0.16, cy = H * 0.5;
    g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(tx0, cy); g.lineTo(tx1, cy); g.stroke();
    var x = tx0 + (tx1 - tx0) * e;
    var grad = g.createLinearGradient(x - sz / 2, cy - sz / 2, x + sz / 2, cy + sz / 2);
    grad.addColorStop(0, '#5ac8fa'); grad.addColorStop(1, '#0a84ff');
    g.fillStyle = grad;
    roundRect(g, x - sz / 2, cy - sz / 2, sz, sz, sz * 0.26); g.fill();
    // label
    g.fillStyle = 'rgba(245,245,247,0.55)';
    g.font = '500 ' + Math.round(H * 0.055) + 'px -apple-system, "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    var label = f.type === 'spring' ? 'spring' : 'cubic-bezier';
    g.fillText(label, tx0, H - pad * 0.8);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // Small static curve for Easing cards.
  function drawMiniCurve(canvas, curveId, vals) {
    var g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, f = Easing.make(curveId, vals);
    g.clearRect(0, 0, W, H);
    var pad = H * 0.16, lo = -0.15, hi = 1.3;
    function Y(v) { return pad + (H - pad * 2) * (1 - (v - lo) / (hi - lo)); }
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, Y(0)); g.lineTo(W - pad, Y(0)); g.moveTo(pad, Y(1)); g.lineTo(W - pad, Y(1)); g.stroke();
    g.strokeStyle = '#0a84ff'; g.lineWidth = 2;
    g.beginPath();
    for (var i = 0; i <= 60; i++) {
      var p = i / 60, x = pad + p * (W - pad * 2), y = Y(f(p));
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }

  // Render a single representative frame (used for card thumbnails).
  function still(canvas, preset, settings) {
    if (preset.kind === 'ease') return drawMiniCurve(canvas, preset.curve, null);
    var pv = new Preview(canvas);
    pv.canvas = canvas;
    pv.off.width = pv.acc.width = canvas.width;
    pv.off.height = pv.acc.height = canvas.height;
    pv.preset = preset;
    pv.settings = Engine.settingsFor(preset, settings);
    pv.r = Engine.resolve(preset, settings);
    pv.timeline = buildTimeline(pv);
    var t;
    if (preset.kind === 'static' || preset.kind === 'loop') t = 1.3;
    else if (preset.kind === 'transition') t = 0.7 + pv.r.duration * 0.55;
    else t = ((pv.settings.where || 'in') === 'out' ? 1.1 + pv.r.duration * 0.6 : 0.35 + pv.r.duration * 0.18);
    pv.render(t);
  }

  root.AFX.Preview = Preview;
  root.AFX.PreviewUtil = { still: still, drawMiniCurve: drawMiniCurve };
})(window);
