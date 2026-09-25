/*
 * AppleFX — panel UI.
 * Layout: category toolbar · preset list · detail (curve editor or live preview,
 * settings) · Apply bar · status bar.
 */
(function () {
  'use strict';

  var AFX = window.AFX, Easing = AFX.Easing, Presets = AFX.Presets, Engine = AFX.Engine, Host = AFX.Host;
  var $ = function (id) { return document.getElementById(id); };
  var SVGNS = 'http://www.w3.org/2000/svg';

  // ------------------------------------------------------------ state
  var STORE = 'applefx.v2';
  var state = { cat: 'easing', sel: {}, settings: {}, fav: {}, theme: 'light' };
  var results = {};
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) for (var k in state) if (saved[k] !== undefined) state[k] = saved[k];
  } catch (e) {}
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }

  var ICONS = {
    easing: '<svg viewBox="0 0 24 24"><path d="M4 19c7 0 9-14 16-14"/></svg>',
    text: '<span class="aa">Aa</span>',
    transitions: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="8" height="12" rx="2"/><rect x="13" y="6" width="8" height="12" rx="2"/></svg>',
    glass: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M4 10h16"/></svg>',
    styles: '<svg viewBox="0 0 24 24"><path d="M11 3c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6z"/><path d="M18 14c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8z"/></svg>',
    loops: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2.5-6 5 12 2.5-6h4"/></svg>'
  };
  var HINTS = {
    easing: 'Select clips with 2+ keyframes, then Apply.',
    text: 'Applies to the selected clips. Undo with Ctrl/Cmd+Z.',
    transitions: 'Select neighbouring clips on one track.',
    glass: 'Apply to a copy of your footage on the track above.',
    styles: 'One-click look for the selected clips.',
    loops: 'Bakes motion across each selected clip.'
  };
  var STAR = '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/></svg>';

  function presetsIn(cat) { return Presets.PRESETS.filter(function (p) { return p.cat === cat; }); }
  function current() {
    var p = Presets.byId[state.sel[state.cat]];
    return (p && p.cat === state.cat) ? p : presetsIn(state.cat)[0];
  }
  function settingsOf(p) {
    var s = Engine.settingsFor(p, null), mine = state.settings[p.id] || {}, k;
    s.density = s.density || 'smart';
    for (k in mine) s[k] = mine[k];
    return s;
  }
  function setSetting(p, key, value) {
    (state.settings[p.id] || (state.settings[p.id] = {}))[key] = value;
    save();
  }
  function isEdited(p) {
    var m = state.settings[p.id];
    if (!m) return false;
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) return true;
    return false;
  }

  // ------------------------------------------------------------ theme
  function applyTheme() { document.documentElement.setAttribute('data-theme', state.theme); }
  $('theme').addEventListener('click', function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    save(); applyTheme();
  });
  applyTheme();

  // ------------------------------------------------------------ toolbar
  function renderToolbar() {
    var bar = $('toolbar');
    bar.innerHTML = '';
    Presets.CATEGORIES.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'tool';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c.id === state.cat));
      b.title = c.name;
      b.setAttribute('aria-label', c.name);
      b.innerHTML = ICONS[c.id];
      b.addEventListener('click', function () { state.cat = c.id; save(); renderAll(); });
      bar.appendChild(b);
    });
  }

  // ------------------------------------------------------------ preset list
  function renderList() {
    var list = $('list'), cur = current(), items = presetsIn(state.cat);
    var cat = Presets.CATEGORIES.filter(function (c) { return c.id === state.cat; })[0];
    $('catName').textContent = cat.name.toUpperCase();
    $('catCount').textContent = items.length;
    list.innerHTML = '';
    items.forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'item';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(p.id === cur.id));
      li.tabIndex = p.id === cur.id ? 0 : -1;
      li.innerHTML = '<span class="bullet"></span><div class="txt"><div class="nm"></div><div class="sb"></div></div>' +
        '<button class="star' + (state.fav[p.id] ? ' on' : '') + '" aria-label="Favorite">' + STAR + '</button>';
      li.querySelector('.nm').textContent = p.name;
      li.querySelector('.sb').textContent = p.desc;
      li.title = p.desc;
      li.addEventListener('click', function (e) {
        if (e.target.closest('.star')) {
          if (state.fav[p.id]) delete state.fav[p.id]; else state.fav[p.id] = true;
          save(); renderList();
          return;
        }
        select(p);
      });
      list.appendChild(li);
    });
    var sel = list.querySelector('[aria-selected="true"]');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }
  function select(p) {
    state.sel[p.cat] = p.id;
    save();
    renderList(); renderDetail();
    var sel = $('list').querySelector('[aria-selected="true"]');
    if (sel) sel.focus({ preventScroll: true });
  }
  $('list').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    var items = presetsIn(state.cat), i = items.indexOf(current());
    i = Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    select(items[i]);
  });

  // ------------------------------------------------------------ curve editor (Easing)
  var CW = 320, CH = 210, PX = 36, PY = 28;
  var ed = null;
  function node(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var a in attrs) n.setAttribute(a, attrs[a]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function X(u) { return PX + u * (CW - 2 * PX); }
  function Y(v) { return CH - PY - (v - ed.lo) / (ed.hi - ed.lo) * (CH - 2 * PY); }

  function curveValues(p) {
    var def = Easing.byId[p.curve], s = settingsOf(p);
    return (s.edit || def.v).slice();
  }

  function renderCurve(p) {
    var svg = $('curve'), def = Easing.byId[p.curve], vals = curveValues(p);
    var f = Easing.make(p.curve, vals), lo = -0.08, hi = 1.08, i;
    if (def.type === 'bezier') {
      lo = Math.min(lo, vals[1] - 0.08, vals[3] - 0.08);
      hi = Math.max(hi, vals[1] + 0.08, vals[3] + 0.08);
    } else {
      for (i = 0; i <= 200; i++) { var v = f(i / 200); lo = Math.min(lo, v - 0.08); hi = Math.max(hi, v + 0.08); }
    }
    ed = { p: p, type: def.type, vals: vals, f: f, lo: lo, hi: hi };
    svg.innerHTML = '';
    var g = node('g', {}, svg);
    for (i = 1; i < 4; i++) {
      node('line', { class: 'grid', x1: X(i / 4), x2: X(i / 4), y1: Y(0), y2: Y(1) }, g);
      node('line', { class: 'grid', x1: X(0), x2: X(1), y1: Y(i / 4), y2: Y(i / 4) }, g);
    }
    node('rect', { class: 'box', x: X(0), y: Y(1), width: X(1) - X(0), height: Y(0) - Y(1) }, g);
    ed.path = node('path', { class: 'path' }, svg);
    if (def.type === 'bezier') {
      ed.arm1 = node('line', { class: 'arm' }, svg);
      ed.arm2 = node('line', { class: 'arm' }, svg);
    }
    node('circle', { class: 'end', cx: X(0), cy: Y(0), r: 3.2 }, svg);
    node('circle', { class: 'end', cx: X(1), cy: Y(1), r: 3.2 }, svg);
    ed.runner = node('circle', { class: 'runner', r: 4.2, cx: X(0), cy: Y(0) }, svg);
    if (def.type === 'bezier') {
      ed.h = [0, 1].map(function (j) {
        var dot = node('circle', { class: 'handle', r: 4.6 }, svg);
        var hit = node('circle', { class: 'hit', r: 15 }, svg);
        dragHandle(hit, j);
        return [dot, hit];
      });
    }
    drawCurve();
  }

  function drawCurve() {
    var v = ed.vals;
    if (ed.type === 'bezier') {
      ed.path.setAttribute('d', 'M' + X(0) + ' ' + Y(0) + ' C' + X(v[0]) + ' ' + Y(v[1]) + ' ' + X(v[2]) + ' ' + Y(v[3]) + ' ' + X(1) + ' ' + Y(1));
      set(ed.arm1, { x1: X(0), y1: Y(0), x2: X(v[0]), y2: Y(v[1]) });
      set(ed.arm2, { x1: X(1), y1: Y(1), x2: X(v[2]), y2: Y(v[3]) });
      ed.h.forEach(function (h, j) {
        set(h[0], { cx: X(v[j * 2]), cy: Y(v[j * 2 + 1]) });
        set(h[1], { cx: X(v[j * 2]), cy: Y(v[j * 2 + 1]) });
      });
    } else {
      var d = '', i;
      for (i = 0; i <= 160; i++) d += (i ? 'L' : 'M') + X(i / 160).toFixed(2) + ' ' + Y(ed.f(i / 160)).toFixed(2);
      ed.path.setAttribute('d', d);
    }
  }
  // SVG elements have no .hidden property, so toggle the attribute directly.
  function show(n, on) { if (on) n.removeAttribute('hidden'); else n.setAttribute('hidden', ''); }
  function set(n, attrs) { for (var a in attrs) n.setAttribute(a, attrs[a]); }

  function dragHandle(hit, j) {
    var svg = $('curve');
    hit.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      hit.setPointerCapture(e.pointerId);
      var move = function (ev) {
        var pt = svg.createSVGPoint();
        pt.x = ev.clientX; pt.y = ev.clientY;
        pt = pt.matrixTransform(svg.getScreenCTM().inverse());
        var u = Math.max(0, Math.min(1, (pt.x - PX) / (CW - 2 * PX)));
        var v = ed.lo + (CH - PY - pt.y) / (CH - 2 * PY) * (ed.hi - ed.lo);
        v = Math.max(-1, Math.min(2, v));
        ed.vals[j * 2] = r2(u); ed.vals[j * 2 + 1] = r2(v);
        ed.f = Easing.make(ed.p.curve, ed.vals);
        setSetting(ed.p, 'edit', ed.vals.slice());
        drawCurve(); updateHeader(); syncCode();
      };
      var up = function () {
        hit.removeEventListener('pointermove', move);
        hit.removeEventListener('pointerup', up);
        hit.removeEventListener('pointercancel', up);
        renderDetail();
      };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerup', up);
      hit.addEventListener('pointercancel', up);
    });
  }

  function bezierText(v) { return 'cubic-bezier(' + v.map(function (x) { return +x.toFixed(2); }).join(', ') + ')'; }
  function syncCode() {
    var c = document.getElementById('code');
    if (c && document.activeElement !== c) { c.value = bezierText(ed.vals); c.classList.remove('bad'); }
  }

  // Spring <-> "Bounces (Hz)" / "Settle (1/s)"
  function toBS(v) {
    var wn = 2 * Math.PI / v[0], z = v[1];
    return { b: z < 1 ? wn * Math.sqrt(1 - z * z) / (2 * Math.PI) : 0, s: z * wn };
  }
  function fromBS(b, s) {
    var wd = 2 * Math.PI * b, wn = Math.sqrt(s * s + wd * wd);
    return [2 * Math.PI / wn, s / wn];
  }

  // Runner dot that travels along the curve.
  var runT0 = performance.now();
  function runLoop() {
    if (ed && !$('curve').hasAttribute('hidden')) {
      var t = ((performance.now() - runT0) / 1000) % 2.6;
      var pp = Math.max(0, Math.min(1, (t - 0.4) / 1.4)), e = ed.f(pp);
      set(ed.runner, { cx: X(pp), cy: Y(e) });
    }
    requestAnimationFrame(runLoop);
  }
  requestAnimationFrame(runLoop);

  // ------------------------------------------------------------ detail
  var preview = new AFX.Preview($('preview'));
  $('replay').addEventListener('click', function () { preview.replay(); runT0 = performance.now(); });

  function updateHeader() {
    var p = current(), edited = isEdited(p);
    $('title').textContent = (p.kind === 'ease' && edited) ? 'Custom Curve' : p.name;
    $('edited').hidden = !edited;
    var r = $('resetEdit');
    r.hidden = !edited;
    r.textContent = 'Reset to ' + p.name;
  }
  $('resetEdit').addEventListener('click', function () {
    delete state.settings[current().id];
    save(); renderDetail();
  });

  function renderDetail() {
    var p = current(), s = settingsOf(p), isEase = p.kind === 'ease';
    updateHeader();
    $('desc').textContent = isEase ? '' : p.desc;
    $('applyHint').textContent = HINTS[p.cat];
    show($('curve'), isEase);
    show($('preview'), !isEase);
    $('replay').hidden = isEase;
    if (isEase) {
      preview.stop();
      renderCurve(p);
    } else {
      preview.set(p, s);
      preview.start();
    }
    renderControls(p, s);
    var res = results[p.id];
    $('result').hidden = !res;
    $('result').textContent = res || '';
  }

  // ------------------------------------------------------------ controls
  var CURVE_OPTIONS = Easing.CURVES.map(function (c) { return [c.id, c.name]; });

  function controlsFor(p) {
    var c = [], isGlass = p.cat === 'glass';
    var curve = { t: 'select', key: 'curve', label: 'Curve', options: CURVE_OPTIONS };
    var duration = { t: 'range', key: 'duration', label: 'Duration', min: 0.1, max: 3, step: 0.05, unit: 's' };
    var intensity = { t: 'range', key: 'intensity', label: 'Intensity', min: 0, max: 200, step: 5, unit: '%' };
    var mblur = { t: 'toggle', key: 'motionBlur', label: 'Motion blur' };
    var density = { t: 'seg', key: 'density', label: 'Keyframes', options: [['smart', 'Smart'], ['full', 'Every frame']] };
    function glassCtl() {
      c.push({ t: 'range', key: 'blur', label: 'Frost', min: 0, max: 150, step: 1 });
      c.push({ t: 'range', key: 'tint', label: 'Tint', min: -60, max: 60, step: 1 });
      if (p.shadow) c.push({ t: 'range', key: 'shadow', label: 'Shadow', min: 0, max: 100, step: 1, unit: '%' });
    }
    if (p.kind === 'anim') {
      c.push(curve, duration);
      if (!isGlass) c.push(intensity);
      c.push({ t: 'seg', key: 'where', label: 'Animate', options: [['in', 'In'], ['out', 'Out'], ['both', 'In + Out']] });
      if (isGlass) glassCtl();
      c.push(mblur, density);
    } else if (p.kind === 'transition') {
      c.push(curve, duration, intensity, mblur, density);
    } else if (p.kind === 'loop') {
      c.push(intensity, { t: 'range', key: 'speed', label: 'Speed', min: 10, max: 300, step: 5, unit: '%' }, mblur, density);
    } else if (p.kind === 'static') {
      if (isGlass) glassCtl();
      else if (p.shadow) c.push({ t: 'range', key: 'shadow', label: 'Shadow', min: 0, max: 100, step: 1, unit: '%' });
    }
    return c;
  }

  function fmt(v, ctl) {
    var d = ctl.step < 0.1 ? 2 : (ctl.step < 1 ? 1 : 0);
    return Number(v).toFixed(d) + (ctl.unit || '');
  }
  function fill(r) {
    var p = (r.value - r.min) / (r.max - r.min) * 100;
    r.style.setProperty('--p', p + '%');
  }

  function rangeCtl(parent, label, value, min, max, step, text, onInput) {
    var row = document.createElement('div');
    row.className = 'ctl';
    row.innerHTML = '<div class="ctl-head"><span></span><span class="val"></span></div>';
    row.querySelector('span').textContent = label;
    var val = row.querySelector('.val');
    val.textContent = text(value);
    var r = document.createElement('input');
    r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
    r.setAttribute('aria-label', label);
    fill(r);
    r.addEventListener('input', function () {
      var v = parseFloat(r.value);
      val.textContent = text(v);
      fill(r);
      onInput(v);
    });
    row.appendChild(r);
    parent.appendChild(row);
    return r;
  }

  function renderControls(p, s) {
    var host = $('controls');
    host.innerHTML = '';

    if (p.kind === 'ease') {
      if (p.curveType === 'bezier') {
        var code = document.createElement('input');
        code.id = 'code'; code.className = 'code'; code.spellcheck = false;
        code.setAttribute('aria-label', 'cubic-bezier values');
        code.value = bezierText(curveValues(p));
        code.addEventListener('change', function () {
          var n = (code.value.match(/-?\d*\.?\d+/g) || []).map(Number);
          if (n.length !== 4 || n[0] < 0 || n[0] > 1 || n[2] < 0 || n[2] > 1) { code.classList.add('bad'); return; }
          setSetting(p, 'edit', n.map(r2));
          renderDetail();
        });
        host.appendChild(code);
        help(host, 'Drag the blue handles on the curve to shape your own ease, or type the values.');
      } else {
        var g = group(host), bs = toBS(curveValues(p));
        var cur = { b: bs.b, s: bs.s };
        var upd = function () {
          setSetting(p, 'edit', fromBS(cur.b, cur.s).map(function (x) { return Math.round(x * 10000) / 10000; }));
          renderCurve(p); updateHeader();
        };
        rangeCtl(g, 'Bounces', r2(cur.b), 0, 6, 0.1, function (v) { return v.toFixed(1) + ' Hz'; }, function (v) { cur.b = v; upd(); });
        rangeCtl(g, 'Settle', r2(cur.s), 1, 40, 0.5, function (v) { return v.toFixed(1); }, function (v) { cur.s = v; upd(); });
        help(host, 'Bounces = how many times it overshoots. Settle = how fast it calms down. The graph updates live.');
      }
      var og = group(host);
      og.style.marginTop = '12px';
      segCtl(og, p, s, { key: 'density', label: 'Keyframes', options: [['smart', 'Smart'], ['full', 'Every frame']] });
      return;
    }

    var list = controlsFor(p);
    if (!list.length) { help(host, 'One click, no settings needed.'); return; }
    var grp = group(host);
    list.forEach(function (ctl) {
      if (ctl.t === 'range') {
        rangeCtl(grp, ctl.label, s[ctl.key], ctl.min, ctl.max, ctl.step, function (v) { return fmt(v, ctl); }, function (v) {
          setSetting(p, ctl.key, v);
          preview.set(p, settingsOf(p));
          updateHeader();
        });
      } else if (ctl.t === 'select') {
        var row = document.createElement('div');
        row.className = 'ctl inline';
        row.innerHTML = '<span></span>';
        row.firstChild.textContent = ctl.label;
        var sel = document.createElement('select');
        sel.setAttribute('aria-label', ctl.label);
        ctl.options.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o[0]; opt.textContent = o[1];
          if (o[0] === s[ctl.key]) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function () { setSetting(p, ctl.key, sel.value); renderDetail(); });
        row.appendChild(sel);
        grp.appendChild(row);
      } else if (ctl.t === 'seg') {
        segCtl(grp, p, s, ctl);
      } else if (ctl.t === 'toggle') {
        var tr = document.createElement('div');
        tr.className = 'ctl inline';
        tr.innerHTML = '<span></span>';
        tr.firstChild.textContent = ctl.label;
        var sw = document.createElement('button');
        sw.className = 'switch';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-label', ctl.label);
        sw.setAttribute('aria-checked', String(!!s[ctl.key]));
        sw.addEventListener('click', function () { setSetting(p, ctl.key, !s[ctl.key]); renderDetail(); });
        tr.appendChild(sw);
        grp.appendChild(tr);
      }
    });
  }

  function group(parent) { var g = document.createElement('div'); g.className = 'group'; parent.appendChild(g); return g; }
  function help(parent, text) { var h = document.createElement('p'); h.className = 'help'; h.textContent = text; parent.appendChild(h); }
  function segCtl(parent, p, s, ctl) {
    var row = document.createElement('div');
    row.className = 'ctl';
    row.innerHTML = '<div class="ctl-head"><span></span></div><div class="seg"></div>';
    row.querySelector('span').textContent = ctl.label;
    var seg = row.querySelector('.seg');
    ctl.options.forEach(function (o) {
      var b = document.createElement('button');
      b.textContent = o[1];
      b.setAttribute('aria-pressed', String(o[0] === s[ctl.key]));
      b.addEventListener('click', function () { setSetting(p, ctl.key, o[0]); renderDetail(); });
      seg.appendChild(b);
    });
    parent.appendChild(row);
  }

  function renderAll() { renderToolbar(); renderList(); renderDetail(); }

  // ------------------------------------------------------------ toast
  var toastTimer;
  function toast(msg, kind) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, kind === 'err' ? 5200 : 3000);
  }

  // ------------------------------------------------------------ selection / status
  var busy = false, lastCtx = null;
  function status(ctx) {
    var dot = $('dot'), n = ctx && ctx.ok ? ctx.clips.length : 0;
    if (!ctx || !ctx.ok) {
      dot.className = 'dot off';
      $('conn').textContent = ctx && ctx.hostMissing ? 'Not connected' : 'No sequence';
    } else {
      dot.className = Host.inHost ? 'dot' : 'dot mock';
      $('conn').textContent = Host.inHost ? 'Connected' : 'Preview mode';
    }
    $('sel').textContent = n + ' clip' + (n === 1 ? '' : 's') + ' selected';
    $('apply').classList.toggle('ready', n > 0);
  }
  function refreshSelection() {
    if (busy || document.hidden) return Promise.resolve(lastCtx);
    return Host.call('getContext').then(function (ctx) { lastCtx = ctx; status(ctx); return ctx; });
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

  function setBusy(b) {
    busy = b;
    $('apply').disabled = b; $('clear').disabled = b;
    $('apply').textContent = b ? 'Applying…' : 'Apply';
  }

  $('apply').addEventListener('click', function () {
    var p = current(), s = settingsOf(p), name = $('title').textContent;
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
          if (!clips.length) throw new Error('No keyframe pairs found. Add at least two keyframes (Position, Scale, Opacity…) to the selected clips.');
          return Host.call('applyPlan', { clips: clips });
        });
      }
      return Host.call('applyPlan', { clips: planFor(p, s, ctx) });
    }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'Something went wrong.');
      var msg = 'Applied ' + name + ' · ' + res.clips + ' clip' + (res.clips === 1 ? '' : 's') + (res.keys ? ' · ' + res.keys + ' keyframes' : '');
      results[p.id] = msg;
      if (current().id === p.id) { $('result').textContent = msg; $('result').hidden = false; }
      if (res.warnings && res.warnings.length) {
        toast(res.warnings.length + ' warning' + (res.warnings.length === 1 ? '' : 's') + ': ' + res.warnings[0], 'err');
        if (window.console) console.warn('[AppleFX]', res.warnings);
      } else toast(msg);
    }).catch(function (e) {
      toast(e.message || String(e), 'err');
    }).then(function () {
      setBusy(false);
      refreshSelection();
    });
  });

  $('clear').addEventListener('click', function () {
    setBusy(true);
    Host.call('resetAnimation').then(function (res) {
      if (!res.ok) throw new Error(res.error);
      toast(res.clips ? 'Cleared keyframes on ' + res.clips + ' clip' + (res.clips === 1 ? '' : 's') : 'Select clips to clear.');
    }).catch(function (e) { toast(e.message || String(e), 'err'); })
      .then(function () { setBusy(false); });
  });

  // ------------------------------------------------------------ boot
  window.addEventListener('resize', function () { preview.fit(); });
  renderAll();
  refreshSelection();
})();
