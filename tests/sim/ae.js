// Minimal After Effects scripting DOM simulator, strict where real AE is strict
// (setValue on keyed props throws, ease arrays must match dimensions, influence range, ...).
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const KIT = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
const PT = { PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 };
const PVT = { NO_VALUE: 6412, ThreeD_SPATIAL: 6413, ThreeD: 6414, TwoD_SPATIAL: 6415, TwoD: 6416, OneD: 6417, COLOR: 6418, SHAPE: 6420 };

class KeyframeEase {
  constructor(speed, influence) {
    if (!(influence >= 0.1 && influence <= 100)) throw new Error('KeyframeEase influence out of range: ' + influence);
    if (!Number.isFinite(speed)) throw new Error('KeyframeEase speed not finite');
    this.speed = speed; this.influence = influence;
  }
}
class Shape { constructor() { this.vertices = []; this.closed = false; } }

const clone = (v) => (Array.isArray(v) ? v.slice() : (v instanceof Shape ? Object.assign(new Shape(), v) : v));
function lerp(a, b, u) {
  if (typeof a === 'number') return a + (b - a) * u;
  if (a instanceof Shape) return Object.assign(new Shape(), { closed: a.closed, vertices: a.vertices.map((p, i) => [p[0] + (b.vertices[i][0] - p[0]) * u, p[1] + (b.vertices[i][1] - p[1]) * u]) });
  return a.map((x, i) => x + (b[i] - x) * u);
}

class Property {
  constructor(matchName, value, opts = {}) {
    this.matchName = matchName; this.name = opts.name || matchName;
    this._value = clone(value); this.keys = [];
    this.propertyType = PT.PROPERTY;
    this.isSpatial = !!opts.spatial;
    this.propertyValueType = opts.pvt || (typeof value === 'number' ? PVT.OneD : value instanceof Shape ? PVT.SHAPE
      : this.isSpatial ? (value.length === 3 ? PVT.ThreeD_SPATIAL : PVT.TwoD_SPATIAL) : (value.length === 3 ? PVT.ThreeD : PVT.TwoD));
    this.dimensionsSeparated = false;
    this.canSetExpression = true; this.expression = ''; this.expressionEnabled = true;
    this.selectedKeys = [];
    this.min = opts.min; this.max = opts.max;
  }
  get numKeys() { return this.keys.length; }
  get value() { return this.valueAtTime(0, true); }
  dims() { return this.isSpatial ? 1 : (typeof this._value === 'number' ? 1 : this._value.length); }
  check(v) {
    if (v === undefined || v === null) throw new Error(this.matchName + ': undefined value');
    const arr = typeof v === 'number' ? [v] : v instanceof Shape ? [] : v;
    arr.forEach((x) => { if (!Number.isFinite(x)) throw new Error(this.matchName + ': non-finite value ' + JSON.stringify(v)); });
    if (typeof this._value === 'number' && typeof v !== 'number') throw new Error(this.matchName + ': expected number');
    if (Array.isArray(this._value) && (!Array.isArray(v) || v.length !== this._value.length)) throw new Error(this.matchName + ': dimension mismatch ' + JSON.stringify(v));
    if (this.min !== undefined && v < this.min - 1e-9) throw new Error(this.matchName + ': below min ' + v);
    if (this.max !== undefined && v > this.max + 1e-9) throw new Error(this.matchName + ': above max ' + v);
  }
  setValue(v) {
    if (this.keys.length) throw new Error('setValue on a keyframed property (' + this.matchName + ')');
    this.check(v); this._value = clone(v);
  }
  setValueAtTime(t, v) {
    this.check(v);
    const i = this.keys.findIndex((k) => Math.abs(k.t - t) < 1e-6);
    const k = { t, v: clone(v), inI: KIT.LINEAR, outI: KIT.LINEAR, inE: null, outE: null };
    if (i >= 0) this.keys[i] = k; else this.keys.push(k);
    this.keys.sort((a, b) => a.t - b.t);
  }
  setValuesAtTimes(ts, vs) {
    if (ts.length !== vs.length) throw new Error('setValuesAtTimes length mismatch');
    ts.forEach((t, i) => this.setValueAtTime(t, vs[i]));
  }
  valueAtTime(t) {
    const K = this.keys;
    if (!K.length) return clone(this._value);
    if (t <= K[0].t) return clone(K[0].v);
    for (let i = 1; i < K.length; i++) {
      if (t <= K[i].t) {
        if (K[i - 1].outI === KIT.HOLD) return clone(K[i - 1].v);
        return lerp(K[i - 1].v, K[i].v, (t - K[i - 1].t) / (K[i].t - K[i - 1].t));
      }
    }
    return clone(K[K.length - 1].v);
  }
  k(i) { if (i < 1 || i > this.keys.length) throw new Error('key index out of range ' + i); return this.keys[i - 1]; }
  keyTime(i) { return this.k(i).t; }
  keyValue(i) { return clone(this.k(i).v); }
  removeKey(i) { this.k(i); this.keys.splice(i - 1, 1); }
  nearestKeyIndex(t) {
    let best = 1, d = Infinity;
    this.keys.forEach((k, i) => { if (Math.abs(k.t - t) < d) { d = Math.abs(k.t - t); best = i + 1; } });
    if (!this.keys.length) throw new Error('no keys');
    return best;
  }
  setInterpolationTypeAtKey(i, a, b) { const k = this.k(i); k.inI = a; k.outI = b === undefined ? a : b; }
  keyInInterpolationType(i) { return this.k(i).inI; }
  keyOutInterpolationType(i) { return this.k(i).outI; }
  setSpatialTangentsAtKey(i, a, b) {
    if (!this.isSpatial) throw new Error('not spatial');
    const n = this._value.length;
    if (a.length !== n || b.length !== n) throw new Error('tangent dims');
    this.k(i);
  }
  setRovingAtKey(i) { if (!this.isSpatial) throw new Error('not spatial'); this.k(i); }
  keyInTemporalEase(i) { return this.k(i).inE || Array.from({ length: this.dims() }, () => new KeyframeEase(0, 16.666666)); }
  keyOutTemporalEase(i) { return this.k(i).outE || Array.from({ length: this.dims() }, () => new KeyframeEase(0, 16.666666)); }
  setTemporalEaseAtKey(i, inE, outE) {
    const k = this.k(i), n = this.dims();
    if (inE.length !== n || (outE && outE.length !== n)) throw new Error('temporal ease dimension mismatch on ' + this.matchName + ': ' + inE.length + '/' + n);
    k.inE = inE; k.outE = outE || inE;
  }
}

class Group {
  constructor(matchName, children = [], opts = {}) {
    this.matchName = matchName; this.name = opts.name || matchName;
    this.children = children; this.propertyType = opts.indexed ? PT.INDEXED_GROUP : PT.NAMED_GROUP;
    this.factory = opts.factory || {};
  }
  get numProperties() { return this.children.length; }
  property(x) {
    if (typeof x === 'number') { const c = this.children[x - 1]; if (!c) throw new Error('bad index ' + x); return c; }
    return this.children.find((c) => c.matchName === x || c.name === x) || null;
  }
  canAddProperty(m) { return !!this.factory[m]; }
  addProperty(m) {
    if (!this.factory[m]) throw new Error('cannot add ' + m);
    const p = this.factory[m]();
    this.children.push(p);
    return p;
  }
}

function effect(match, params) {
  return () => new Group(match, params.map(([suffix, v, o]) => new Property(match + '-' + suffix, v, o)));
}
const EFFECTS = {
  'ADBE Gaussian Blur 2': effect('ADBE Gaussian Blur 2', [['0001', 0, { min: 0 }], ['0002', 1], ['0003', 0]]),
  'ADBE Brightness & Contrast 2': effect('ADBE Brightness & Contrast 2', [['0001', 0, { min: -150, max: 150 }], ['0002', 0], ['0003', 0]]),
  'ADBE Drop Shadow': effect('ADBE Drop Shadow', [['0001', [0, 0, 0, 1], { pvt: PVT.COLOR }], ['0002', 127.5, { min: 0, max: 255 }], ['0003', 135], ['0004', 5, { min: 0 }], ['0005', 0, { min: 0 }], ['0006', 0]]),
  'ADBE Black&White': effect('ADBE Black&White', [['0001', 40]])
};

class Layer {
  constructor(index, name, inPoint, outPoint, opts = {}) {
    this.index = index; this.name = name; this.inPoint = inPoint; this.outPoint = outPoint; this.motionBlur = false;
    const W = opts.w || 1920, H = opts.h || 1080;
    this.w = W; this.h = H;
    const pos = new Property('ADBE Position', opts.pos || [960, 540], { spatial: true });
    const tr = [
      new Property('ADBE Anchor Point', [W / 2, H / 2], { spatial: true }),
      pos,
      new Property('ADBE Position_0', (opts.pos || [960])[0]),
      new Property('ADBE Position_1', (opts.pos || [0, 540])[1]),
      new Property('ADBE Scale', opts.scale || [100, 100]),
      new Property('ADBE Rotate Z', 0),
      new Property('ADBE Opacity', 100, { min: 0, max: 100 })
    ];
    if (opts.separated) pos.dimensionsSeparated = true;
    this.groups = [
      new Group('ADBE Transform Group', tr),
      new Group('ADBE Effect Parade', [], { indexed: true, factory: EFFECTS }),
      new Group('ADBE Mask Parade', [], {
        indexed: true,
        factory: { 'ADBE Mask Atom': () => new Group('ADBE Mask Atom', [new Property('ADBE Mask Shape', new Shape()), new Property('ADBE Mask Feather', [0, 0])]) }
      })
    ];
  }
  property(m) { return this.groups.find((g) => g.matchName === m) || null; }
  sourceRectAtTime() { return { left: 0, top: 0, width: this.w, height: this.h }; }
}

function makeAE(opts = {}) {
  class CompItem {
    constructor() {
      this.name = 'Comp'; this.width = opts.w || 1920; this.height = opts.h || 1080; this.frameRate = opts.fps || 30;
      this.layers = []; this.selectedLayers = []; this.selectedProperties = []; this.motionBlur = false;
    }
    layer(i) { const l = this.layers.find((x) => x.index === i); if (!l) throw new Error('no layer ' + i); return l; }
  }
  const comp = new CompItem();
  let undoDepth = 0;
  const app = {
    version: '24.0-sim',
    project: { activeItem: comp },
    beginUndoGroup() { undoDepth++; },
    endUndoGroup() { if (undoDepth <= 0) throw new Error('unbalanced undo group'); undoDepth--; }
  };
  const ctx = vm.createContext({
    app, CompItem, KeyframeEase, Shape,
    KeyframeInterpolationType: KIT, PropertyType: PT, PropertyValueType: PVT, MaskMode: { ADD: 6812, NONE: 6816 },
    Math, String, Number, Array, Object, Error, isFinite
  });
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'AppleFX', 'jsx', 'host_ae.jsx'), 'utf8');
  vm.runInContext(src + '\n;this.AppleFX = AppleFX;', ctx);
  return {
    ctx, app, comp, Layer, Property, Shape, KIT,
    undoDepth: () => undoDepth,
    // Call like CEP does: the argument is serialised into the script source.
    call(fn, arg) {
      const script = 'AppleFX.' + fn + '(' + (arg === undefined ? '' : JSON.stringify(arg)) + ')';
      return JSON.parse(vm.runInContext(script, ctx));
    }
  };
}

module.exports = { makeAE, Layer, Property, Shape, KIT };
