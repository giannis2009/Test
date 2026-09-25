/*
 * AppleFX — easing library.
 * Cubic-bezier curves and damped springs in the spirit of Apple's motion language.
 * Every curve is exposed as f(p) where p is normalized progress 0..1 and the
 * result is eased progress (may overshoot above 1 for springs / back curves).
 */
(function (root) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // Cubic bezier solver (same approach as WebKit's UnitBezier).
  function cubicBezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    function sx(t) { return ((ax * t + bx) * t + cx) * t; }
    function sy(t) { return ((ay * t + by) * t + cy) * t; }
    function dsx(t) { return (3 * ax * t + 2 * bx) * t + cx; }
    function solveX(x) {
      var t = x, i, err, d;
      for (i = 0; i < 8; i++) {
        err = sx(t) - x;
        if (Math.abs(err) < 1e-7) return t;
        d = dsx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= err / d;
      }
      var lo = 0, hi = 1;
      t = x;
      for (i = 0; i < 60; i++) {
        var v = sx(t);
        if (Math.abs(v - x) < 1e-7) return t;
        if (x > v) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return t;
    }
    return function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      return sy(solveX(p));
    };
  }

  // Damped harmonic oscillator, parameterised like SwiftUI's spring(response:dampingFraction:).
  // Returns raw position for time t (seconds), converging to 1.
  function springRaw(response, damping) {
    var w = 2 * Math.PI / Math.max(0.05, response);
    var z = Math.max(0.05, damping);
    if (z < 1) {
      var wd = w * Math.sqrt(1 - z * z);
      return function (t) {
        return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
      };
    }
    if (z === 1) {
      return function (t) { return 1 - Math.exp(-w * t) * (1 + w * t); };
    }
    var s = Math.sqrt(z * z - 1);
    var r1 = -w * (z - s), r2 = -w * (z + s);
    return function (t) {
      return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
    };
  }

  // Time after which the spring stays within `eps` of its target.
  function springSettle(fn, eps) {
    eps = eps || 0.001;
    var dt = 1 / 240, last = 0, t;
    for (t = 0; t <= 12; t += dt) {
      if (Math.abs(1 - fn(t)) >= eps) last = t;
    }
    return Math.max(dt, last + dt);
  }

  // Spring normalised to 0..1 progress: the whole settle time maps onto p.
  // This lets the user choose any duration while keeping the spring's shape.
  function spring(response, damping) {
    var raw = springRaw(response, damping);
    var settle = springSettle(raw);
    var f = function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      return raw(p * settle);
    };
    f.settle = settle;
    return f;
  }

  // Mirror an ease-out into the matching ease-in (used for exits).
  function mirror(f) { return function (p) { return 1 - f(1 - p); }; }

  var CURVES = [
    { id: 'apple-default', name: 'Apple Default', type: 'bezier', v: [0.25, 0.1, 0.25, 1], desc: 'The system default ease used across Apple UI.' },
    { id: 'ease-in-out', name: 'Ease In Out', type: 'bezier', v: [0.42, 0, 0.58, 1], desc: 'Symmetric acceleration and deceleration.' },
    { id: 'ease-out', name: 'Ease Out', type: 'bezier', v: [0, 0, 0.58, 1], desc: 'Starts fast, lands softly. Best for entrances.' },
    { id: 'ease-in', name: 'Ease In', type: 'bezier', v: [0.42, 0, 1, 1], desc: 'Starts slow, leaves fast. Best for exits.' },
    { id: 'keynote-smooth', name: 'Keynote Smooth', type: 'bezier', v: [0.16, 1, 0.3, 1], desc: 'Long exponential glide, the classic keynote reveal.' },
    { id: 'keynote-emphasis', name: 'Keynote Emphasis', type: 'bezier', v: [0.2, 0, 0, 1], desc: 'Confident start with a very soft landing.' },
    { id: 'ios-sheet', name: 'iOS Sheet', type: 'bezier', v: [0.32, 0.72, 0, 1], desc: 'The curve of a sheet sliding up on iPhone.' },
    { id: 'dramatic', name: 'Dramatic', type: 'bezier', v: [0.83, 0, 0.17, 1], desc: 'Strong in-out for hero moments and whips.' },
    { id: 'overshoot', name: 'Overshoot', type: 'bezier', v: [0.34, 1.56, 0.64, 1], desc: 'Goes a little past the target and settles back.' },
    { id: 'spring-smooth', name: 'Spring · Smooth', type: 'spring', v: [0.5, 1.0], desc: 'Critically damped spring, no bounce.' },
    { id: 'spring-snappy', name: 'Spring · Snappy', type: 'spring', v: [0.5, 0.85], desc: 'Quick spring with a hint of bounce.' },
    { id: 'spring-bouncy', name: 'Spring · Bouncy', type: 'spring', v: [0.5, 0.6], desc: 'Playful spring that overshoots and settles.' },
    { id: 'spring-gentle', name: 'Spring · Gentle', type: 'spring', v: [0.8, 0.9], desc: 'Slow, relaxed spring for large movements.' },
    { id: 'spring-wobbly', name: 'Spring · Wobbly', type: 'spring', v: [0.6, 0.45], desc: 'Loose spring with visible oscillation.' },
    { id: 'custom-bezier', name: 'Custom Bezier', type: 'bezier', custom: true, v: [0.25, 0.1, 0.25, 1], desc: 'Your own cubic-bezier control points.' },
    { id: 'custom-spring', name: 'Custom Spring', type: 'spring', custom: true, v: [0.5, 0.8], desc: 'Your own response and damping.' }
  ];

  var byId = {};
  CURVES.forEach(function (c) { byId[c.id] = c; });

  var cache = {};
  // Build the curve function. `values` overrides v for custom curves.
  function make(id, values) {
    var def = byId[id] || byId['apple-default'];
    var v = (def.custom && values) ? values : def.v;
    var key = def.type + ':' + v.join(',');
    if (cache[key]) return cache[key];
    var f = def.type === 'spring'
      ? spring(v[0], v[1])
      : cubicBezier(clamp(v[0], 0, 1), v[1], clamp(v[2], 0, 1), v[3]);
    f.type = def.type;
    cache[key] = f;
    return f;
  }

  // Exit curve: mirrored bezier (ease-out -> ease-in); springs exit with a clean accelerate.
  var springExit = cubicBezier(0.5, 0, 0.75, 0);
  function makeExit(id, values) {
    var f = make(id, values);
    return f.type === 'spring' ? springExit : mirror(f);
  }

  var api = {
    CURVES: CURVES,
    byId: byId,
    make: make,
    makeExit: makeExit,
    cubicBezier: cubicBezier,
    spring: spring,
    mirror: mirror,
    clamp: clamp
  };

  root.AFX = root.AFX || {};
  root.AFX.Easing = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
