// End-to-end: the panel's bridge (js/cep.js) talking to the simulated After Effects
// through a fake CEP evalScript, including the case where the host script was never loaded.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeAE, Layer } = require('./sim/ae.js');

const APPLEFX = path.join(__dirname, '..', 'AppleFX');

function panel(ae, opts = {}) {
  const evals = [];
  const cep = {
    evalScript(script, cb) {
      evals.push(script);
      let res;
      try { const v = vm.runInContext(script, ae.ctx); res = v === undefined ? 'undefined' : String(v); } catch (e) { res = 'EvalScript error.'; }
      setImmediate(() => cb(res));
    },
    getHostEnvironment: () => JSON.stringify({ appName: 'AEFT', appVersion: '24.6', appUILocale: 'en_US' }),
    getSystemPath: () => opts.systemPath || ('file://' + APPLEFX)
  };
  const win = { __adobe_cep__: cep, location: { search: '' }, AFX: {} };
  const ctx = vm.createContext({ window: win, Promise, JSON, setImmediate, console });
  if (!opts.noEmbedded) vm.runInContext(fs.readFileSync(path.join(APPLEFX, 'js', 'host_src.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(APPLEFX, 'js', 'cep.js'), 'utf8'), ctx);
  return { Host: win.AFX.Host, evals };
}

function freshAE() {
  const ae = makeAE({ noHost: true });
  ae.comp.layers.push(new Layer(1, 'Title', 0, 5));
  ae.comp.selectedLayers = ae.comp.layers.slice();
  return ae;
}

test('detects After Effects and loads the embedded host script when the manifest did not', async () => {
  const ae = freshAE();
  const { Host } = panel(ae);
  assert.equal(Host.isAE, true);
  assert.equal(Host.label, 'After Effects');
  const ctx = await Host.call('getContext');
  assert.equal(ctx.ok, true, ctx.error);
  assert.equal(ctx.sequence, 'Comp');
  assert.equal(ctx.clips.length, 1);
  assert.equal(Host.state.method, 'embedded');
});

test('falls back to the jsx file when the embedded copy is missing', async () => {
  const ae = freshAE();
  const { Host } = panel(ae, { noEmbedded: true });
  const ctx = await Host.call('getContext');
  assert.equal(ctx.ok, true, ctx.error);
  assert.equal(Host.state.method, 'file');
});

test('reports exactly why it cannot connect', async () => {
  const ae = freshAE();
  const { Host } = panel(ae, { noEmbedded: true, systemPath: 'file:///C:/Nowhere/AppleFX' });
  const ctx = await Host.call('getContext');
  assert.equal(ctx.ok, false);
  assert.equal(ctx.hostMissing, true);
  assert.match(ctx.error, /After Effects did not answer/);
  assert.match(ctx.error, /file not found C:\/Nowhere\/AppleFX\/jsx\/host_ae\.jsx/, 'Windows path converted without a leading slash');
  const d = await Host.diagnostics();
  assert.equal(d.app, 'After Effects');
  assert.equal(d.appVersion, '24.6');
  assert.equal(d.extensionPath, 'C:/Nowhere/AppleFX');
  assert.match(d.hostScript, /^not answering/);
});

test('reloads automatically if After Effects lost the script', async () => {
  const ae = freshAE();
  const { Host } = panel(ae);
  assert.equal((await Host.call('getContext')).ok, true);
  vm.runInContext('delete AppleFX', ae.ctx);
  const again = await Host.call('getContext');
  assert.equal(again.ok, true, again.error);
});

test('no composition gives a precise message', async () => {
  const ae = freshAE();
  ae.app.project.activeItem = { name: 'footage.mov' };
  const { Host } = panel(ae);
  const ctx = await Host.call('getContext');
  assert.equal(ctx.ok, false);
  assert.match(ctx.error, /"footage.mov" is not a composition/);
});

test('full apply through the bridge works', async () => {
  const ae = freshAE();
  const { Host } = panel(ae);
  const r = await Host.call('applyPlan', { clips: [{ track: 0, index: 0, layer: 1, ops: [{ t: 'opacity', mode: 'ident', value: 0.5 }] }] });
  assert.equal(r.ok, true, r.error);
  assert.equal(ae.comp.layers[0].property('ADBE Transform Group').property('ADBE Opacity').value, 50);
});
