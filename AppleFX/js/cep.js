/*
 * AppleFX - bridge between the panel and After Effects / Premiere Pro (ExtendScript).
 * Outside the apps (a normal browser) a mock host is used so the panel can be
 * previewed and developed; the last plan is kept in window.__afxLastPlan.
 */
(function (root) {
  'use strict';

  var cep = root.__adobe_cep__;
  var inHost = !!(cep && cep.evalScript);

  // 'AEFT' (After Effects), 'PPRO' (Premiere Pro). Outside the apps: mock, ?host=ae mocks After Effects.
  var appName = 'PPRO';
  if (inHost) {
    try { appName = JSON.parse(cep.getHostEnvironment()).appName || 'PPRO'; } catch (e) {}
  } else if (root.location && /[?&]host=ae\b/i.test(root.location.search)) appName = 'AEFT';
  var isAE = appName === 'AEFT';

  var APP_LABEL = isAE ? 'After Effects' : 'Premiere Pro';
  var env = {};
  if (inHost) { try { env = JSON.parse(cep.getHostEnvironment()) || {}; } catch (e) {} }

  function rawEval(script) {
    return new Promise(function (resolve) {
      if (!inHost) return resolve(Mock.eval(script));
      try { cep.evalScript(script, function (res) { resolve(res); }); } catch (e) { resolve('EvalScript error.'); }
    });
  }

  function isDead(res) {
    return res === undefined || res === null || res === '' || res === 'EvalScript error.' || res === 'undefined';
  }

  function parse(res) {
    if (isDead(res)) {
      return { ok: false, hostMissing: true, error: APP_LABEL + ' did not answer (' + (res || 'empty reply') + '). ' + (state.lastError || '') };
    }
    try { return JSON.parse(res); } catch (e) { return { ok: false, error: String(res) }; }
  }

  // Diagnostics shown in the panel's details view.
  var state = { loaded: false, method: '', lastError: '', attempts: 0 };

  function extensionPath() {
    var p = '';
    try { p = cep.getSystemPath('extension') || ''; } catch (e) { return ''; }
    try { p = decodeURI(p); } catch (e2) {}
    // Windows gives file:///C:/..., macOS file:///Users/...
    if (/^file:\/\/\/[A-Za-z]:/.test(p)) p = p.replace(/^file:\/\/\//, '');
    else p = p.replace(/^file:\/\//, '');
    return p.replace(/\\/g, '/');
  }

  // Load the host script. Primary: the source embedded in js/host_src.js is evaluated
  // directly (no file paths involved). Fallback: $.evalFile on the jsx file.
  // Both report the exact ExtendScript error if something goes wrong.
  function loadHost() {
    state.attempts++;
    var src = root.AFX.HOST_SRC && root.AFX.HOST_SRC[isAE ? 'AEFT' : 'PPRO'];
    var errors = [];
    var viaEmbedded = src ? rawEval(
      '(function () { try { eval(' + JSON.stringify(src) + '); $.global.AppleFX = AppleFX; return "AFX_OK"; }' +
      ' catch (e) { return "AFX_ERR:" + e + (e.line ? " (line " + e.line + ")" : ""); } })()'
    ) : Promise.resolve('AFX_ERR:embedded host source missing (js/host_src.js)');
    return viaEmbedded.then(function (res) {
      if (res === 'AFX_OK') { state.loaded = true; state.method = 'embedded'; state.lastError = ''; return true; }
      errors.push('embedded: ' + res);
      var file = extensionPath() + '/jsx/' + (isAE ? 'host_ae.jsx' : 'host.jsx');
      return rawEval(
        '(function () { try { var f = new File(' + JSON.stringify(file) + '); if (!f.exists) return "AFX_ERR:file not found " + f.fsName;' +
        ' $.evalFile(f); return (typeof AppleFX === "object") ? "AFX_OK" : "AFX_ERR:AppleFX missing after evalFile"; }' +
        ' catch (e) { return "AFX_ERR:" + e + (e.line ? " (line " + e.line + ")" : ""); } })()'
      ).then(function (r2) {
        if (r2 === 'AFX_OK') { state.loaded = true; state.method = 'file'; state.lastError = ''; return true; }
        errors.push('file: ' + r2);
        state.loaded = false;
        state.lastError = 'Could not load the AppleFX script into ' + APP_LABEL + ' - ' + errors.join(' | ');
        return false;
      });
    });
  }

  function ensureHost() {
    if (!inHost || state.loaded) return Promise.resolve(true);
    return rawEval('typeof AppleFX').then(function (t) {
      if (t === 'object') { state.loaded = true; state.method = state.method || 'manifest'; return true; }
      return loadHost();
    });
  }

  function call(fn, arg) {
    var script = 'AppleFX.' + fn + '(' + (arg === undefined ? '' : JSON.stringify(arg)) + ')';
    return ensureHost().then(function () { return rawEval(script); }).then(function (res) {
      if (!isDead(res) || !inHost) return parse(res);
      // The engine may have been reset (e.g. a new project): reload once and retry.
      state.loaded = false;
      return loadHost().then(function () { return rawEval(script); }).then(parse);
    });
  }

  function diagnostics() {
    var d = {
      inHost: inHost, app: APP_LABEL, appId: appName,
      appVersion: env.appVersion || '', locale: env.appUILocale || '',
      extensionPath: inHost ? extensionPath() : '(browser preview)',
      scriptLoaded: state.loaded, loadMethod: state.method, loadAttempts: state.attempts, lastError: state.lastError
    };
    return call('ping').then(function (p) {
      d.hostScript = p && p.ok ? (p.version + ' / ' + p.app) : ('not answering: ' + ((p && p.error) || '?'));
      return d;
    });
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
      if (fn === 'ping') return JSON.stringify({ ok: true, version: 'preview', app: 'browser mock' });
      if (fn === 'getContext') {
        if (!isAE) return JSON.stringify(Mock.ctx);
        return JSON.stringify({ ok: true, sequence: 'Main Comp', fps: 30, width: 1920, height: 1080, host: 'AEFT',
          clips: Mock.ctx.clips.map(function (c, i) { return { track: 0, index: i, layer: i + 1, name: c.name, start: c.start, end: c.end, dur: c.dur }; }) });
      }
      if (fn === 'applyEase') {
        root.__afxLastEase = arg;
        return JSON.stringify({ ok: true, props: 2, segments: arg.native ? 2 : 0, mode: arg.native ? 'ease' : 'expression' });
      }
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
  root.AFX.Host = { call: call, inHost: inHost, mock: Mock, app: appName, isAE: isAE, label: APP_LABEL, diagnostics: diagnostics, reload: function () { state.loaded = false; return loadHost(); }, state: state };
})(window);
