/*
 * AppleFX — bridge between the panel and Premiere Pro (ExtendScript).
 * Outside Premiere (a normal browser) a mock host is used so the panel can be
 * previewed and developed; the last plan is kept in window.__afxLastPlan.
 */
(function (root) {
  'use strict';

  var cep = root.__adobe_cep__;
  var inHost = !!(cep && cep.evalScript);

  function rawEval(script) {
    return new Promise(function (resolve) {
      if (!inHost) return resolve(Mock.eval(script));
      cep.evalScript(script, function (res) { resolve(res); });
    });
  }

  function parse(res) {
    if (res === undefined || res === null || res === '' || res === 'EvalScript error.' || res === 'undefined') {
      return { ok: false, error: 'Premiere did not answer (' + (res || 'empty') + ').', hostMissing: true };
    }
    try { return JSON.parse(res); } catch (e) { return { ok: false, error: String(res) }; }
  }

  function extensionPath() {
    try { return cep.getSystemPath('extension'); } catch (e) { return ''; }
  }

  var loaded = false;
  // Make sure jsx/host.jsx is loaded (the manifest loads it, but re-load if Premiere lost it).
  function ensureHost() {
    if (!inHost || loaded) return Promise.resolve();
    return rawEval('typeof AppleFX').then(function (t) {
      if (t === 'object') { loaded = true; return; }
      var p = extensionPath().replace(/^file:\/\//, '').replace(/\\/g, '/');
      p = decodeURIComponent(p);
      return rawEval('$.evalFile("' + p + '/jsx/host.jsx")').then(function () { loaded = true; });
    });
  }

  function call(fn, arg) {
    var script = 'AppleFX.' + fn + '(' + (arg === undefined ? '' : JSON.stringify(arg)) + ')';
    return ensureHost().then(function () { return rawEval(script); }).then(parse);
  }

  // ------------------------------------------------------------ mock host
  var Mock = {
    ctx: {
      ok: true, sequence: 'Demo Sequence', fps: 29.97, width: 1920, height: 1080,
      clips: [
        { track: 1, index: 0, name: 'Title.mogrt', start: 0, end: 4, dur: 4 },
        { track: 0, index: 3, name: 'A001_C004.mov', start: 12, end: 18, dur: 6 },
        { track: 0, index: 4, name: 'A001_C007.mov', start: 18, end: 22.5, dur: 4.5 }
      ]
    },
    eval: function (script) {
      var m = /^AppleFX\.(\w+)\((.*)\)$/.exec(script);
      if (!m) return 'object';
      var fn = m[1], arg = m[2] ? JSON.parse(m[2]) : null;
      if (fn === 'ping') return JSON.stringify({ ok: true, version: 'mock' });
      if (fn === 'getContext') return JSON.stringify(Mock.ctx);
      if (fn === 'getKeyframes') {
        return JSON.stringify({ ok: true, fps: 29.97, clips: Mock.ctx.clips.map(function (c) {
          return { track: c.track, index: c.index, name: c.name, params: [
            { ci: 1, pi: 0, name: 'Motion > Position', keys: [[0, [0.3, 0.5]], [1, [0.7, 0.5]]] },
            { ci: 1, pi: 1, name: 'Motion > Scale', keys: [[0, 80], [1.5, 100]] }
          ] };
        }) });
      }
      if (fn === 'applyPlan') {
        root.__afxLastPlan = arg;
        var keys = 0;
        arg.clips.forEach(function (c) { c.ops.forEach(function (o) { if (o.keys) keys += o.keys.length; }); });
        if (root.console) console.log('[AppleFX mock] plan', arg);
        return JSON.stringify({ ok: true, clips: arg.clips.length, keys: keys, warnings: [] });
      }
      if (fn === 'resetAnimation') return JSON.stringify({ ok: true, clips: Mock.ctx.clips.length, params: 4 });
      return JSON.stringify({ ok: false, error: 'unknown ' + fn });
    }
  };

  root.AFX = root.AFX || {};
  root.AFX.Host = { call: call, inHost: inHost, mock: Mock };
})(window);
