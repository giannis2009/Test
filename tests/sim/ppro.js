// Minimal Premiere Pro (ExtendScript DOM + QE DOM) simulator for jsx/host.jsx.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const TPS = 254016000000;

class Time {
  constructor() { this._t = 0; }
  get ticks() { return String(this._t); }
  set ticks(v) { this._t = Math.round(Number(v)); }
  get seconds() { return this._t / TPS; }
  set seconds(v) { this._t = Math.round(v * TPS); }
}
const T = (sec) => { const t = new Time(); t.seconds = sec; return t; };
const clone = (v) => (Array.isArray(v) ? v.slice() : v);
const list = (arr, countName) => { arr[countName] = arr.length; return arr; };

class Param {
  constructor(displayName, value, opts = {}) {
    this.displayName = displayName; this.value = clone(value); this.varying = false; this.keys = new Map();
    this.min = opts.min; this.max = opts.max; this.color = null;
  }
  check(v) {
    const a = Array.isArray(v) ? v : [v];
    a.forEach((x) => { if (typeof x !== 'boolean' && !Number.isFinite(x)) throw new Error(this.displayName + ': bad value ' + JSON.stringify(v)); });
    if (Array.isArray(this.value) !== Array.isArray(v)) throw new Error(this.displayName + ': shape mismatch');
  }
  areKeyframesSupported() { return true; }
  isTimeVarying() { return this.varying; }
  setTimeVarying(b) { this.varying = !!b; if (!b) this.keys.clear(); }
  getValue() { return clone(this.value); }
  setValue(v) {
    if (this.varying) throw new Error('setValue on time-varying param ' + this.displayName);
    this.check(v); this.value = clone(v);
  }
  sorted() { return [...this.keys.entries()].sort((a, b) => a[0] - b[0]); }
  addKey(t) {
    if (!(t instanceof Time)) throw new Error('addKey expects Time');
    if (!this.varying) throw new Error('addKey on non-varying param');
    if (!this.keys.has(t._t)) this.keys.set(t._t, clone(this.value));
  }
  setValueAtKey(t, v) {
    if (!this.keys.has(t._t)) throw new Error('no key at ' + t.seconds);
    this.check(v); this.keys.set(t._t, clone(v));
  }
  getKeys() { return this.sorted().map(([k]) => { const t = new Time(); t._t = k; return t; }); }
  getValueAtKey(t) { return clone(this.keys.get(t._t)); }
  getValueAtTime(t) {
    const K = this.sorted();
    if (!K.length) return clone(this.value);
    const x = t._t;
    if (x <= K[0][0]) return clone(K[0][1]);
    for (let i = 1; i < K.length; i++) {
      if (x <= K[i][0]) {
        const u = (x - K[i - 1][0]) / (K[i][0] - K[i - 1][0]), a = K[i - 1][1], b = K[i][1];
        return Array.isArray(a) ? a.map((q, j) => q + (b[j] - q) * u) : a + (b - a) * u;
      }
    }
    return clone(K[K.length - 1][1]);
  }
  removeKeyRange(a, b) { for (const k of [...this.keys.keys()]) if (k >= a._t && k <= b._t) this.keys.delete(k); }
  setColorValue(a, r, g, b) { this.color = [a, r, g, b]; }
}

class Component {
  constructor(matchName, displayName, params) {
    this.matchName = matchName; this.displayName = displayName; this.properties = list(params, 'numItems');
  }
}
const EFFECTS = {
  'Gaussian Blur': () => new Component('AE.ADBE Gaussian Blur 2', 'Gaussian Blur', [new Param('Blurriness', 0), new Param('Blur Dimensions', 1), new Param('Repeat Edge Pixels', false)]),
  'Crop': () => new Component('AE.ADBE AECrop', 'Crop', [new Param('Left', 0), new Param('Top', 0), new Param('Right', 0), new Param('Bottom', 0), new Param('Zoom', false), new Param('Edge Feather', 0)]),
  'Transform': () => new Component('AE.ADBE Geometry2', 'Transform', [
    new Param('Anchor Point', [0.5, 0.5]), new Param('Position', [0.5, 0.5]), new Param('Uniform Scale', true), new Param('Scale Height', 100),
    new Param('Scale Width', 100), new Param('Skew', 0), new Param('Skew Axis', 0), new Param('Rotation', 0), new Param('Opacity', 100),
    new Param("Use Composition's Shutter Angle", true), new Param('Shutter Angle', 0), new Param('Sampling', 1)]),
  'Brightness & Contrast': () => new Component('AE.ADBE Brightness & Contrast 2', 'Brightness & Contrast', [new Param('Brightness', 0), new Param('Contrast', 0)]),
  'Drop Shadow': () => new Component('AE.ADBE Drop Shadow', 'Drop Shadow', [new Param('Shadow Color', [0, 0, 0, 1]), new Param('Opacity', 127.5), new Param('Direction', 135), new Param('Distance', 5), new Param('Softness', 0), new Param('Shadow Only', false)]),
  'Black & White': () => new Component('AE.ADBE Black&White', 'Black & White', [])
};

class Clip {
  constructor(name, start, end, inPoint, opts = {}) {
    this.name = name; this.start = T(start); this.end = T(end); this.inPoint = T(inPoint); this.selected = true; this.speed = opts.speed || 1;
    this.components = list([
      new Component('AE.ADBE Opacity', 'Opacity', [new Param('Opacity', 100), new Param('Blend Mode', 0)]),
      new Component('AE.ADBE Motion', 'Motion', [new Param('Position', [0.5, 0.5]), new Param('Scale', 100), new Param('Scale Width', 100),
        new Param('Uniform Scale', true), new Param('Rotation', 0), new Param('Anchor Point', [0.5, 0.5]), new Param('Anti-flicker Filter', 0)])
    ], 'numItems');
  }
  isSelected() { return this.selected; }
  getSpeed() { return this.speed; }
}

function makePPro(opts = {}) {
  const fps = opts.fps || 30;
  const tracks = (opts.tracks || [[]]).map((clips) => ({ clips: list(clips, 'numItems') }));
  const seq = {
    name: 'Seq', timebase: String(TPS / fps), frameSizeHorizontal: 1920, frameSizeVertical: 1080,
    videoTracks: list(tracks, 'numTracks')
  };
  const app = { version: '25.0-sim', project: { activeSequence: seq }, enableQE() {} };
  const qe = {
    project: {
      getVideoEffectByName(n) { return EFFECTS[n] ? { name: n } : null; },
      getActiveSequence() {
        return {
          getVideoTrackAt(t) {
            // QE lists gaps as "Empty" items between clips.
            const items = [];
            tracks[t].clips.forEach((c) => {
              items.push({ type: 'Empty' });
              items.push({
                type: 'Clip', name: c.name, start: { ticks: c.start.ticks, secs: c.start.seconds },
                addVideoEffect(fx) { c.components.push(EFFECTS[fx.name]()); c.components.numItems = c.components.length; }
              });
            });
            return { numItems: items.length, getItemAt: (i) => items[i] };
          }
        };
      }
    }
  };
  const ctx = vm.createContext({ app, qe, Time, Math, String, Number, Array, Object, Error, isFinite });
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'AppleFX', 'jsx', 'host.jsx'), 'utf8');
  vm.runInContext(src + '\n;this.AppleFX = AppleFX;', ctx);
  return {
    app, seq, tracks, TPS, T,
    call(fn, arg) {
      return JSON.parse(vm.runInContext('AppleFX.' + fn + '(' + (arg === undefined ? '' : JSON.stringify(arg)) + ')', ctx));
    }
  };
}

module.exports = { makePPro, Clip, Time, T, TPS };
