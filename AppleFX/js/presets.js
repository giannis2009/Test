/*
 * AppleFX — preset library.
 *
 * Presets are declarative. The engine turns them into keyframes for Premiere.
 *
 * State channels (all relative to the clip's own "rest" look):
 *   tx, ty   offset as a fraction of frame width / height
 *   s        scale multiplier (1 = unchanged)
 *   r        rotation in degrees
 *   o        opacity 0..1
 *   blur     Gaussian Blur blurriness (px at 1920 wide)
 *   crop     [left, top, right, bottom] in percent (Crop effect)
 *   bright   Brightness & Contrast brightness (-100..100)
 *
 * Kinds:
 *   ease        easing curve, applied to the clip's existing keyframes
 *   anim        entrance ("from" -> rest) and exit (rest -> "to")
 *   transition  cut transition: outgoing clip plays "exit", incoming plays "enter"
 *   loop        continuous motion over the whole clip
 *   static      a look that is set once (no animation)
 */
(function (root) {
  'use strict';

  var Easing = (root.AFX && root.AFX.Easing) || (typeof require !== 'undefined' ? require('./easing.js') : null);

  var CATEGORIES = [
    { id: 'easing', name: 'Easing', hint: 'Select clips with 2+ keyframes, pick a curve, apply. Works on Motion, Opacity and any effect keyframes.' },
    { id: 'text', name: 'Text', hint: 'Keynote-style reveals. Apply to titles, graphics or any clip.' },
    { id: 'transitions', name: 'Transitions', hint: 'Select two or more neighbouring clips on the same track. The outgoing clip animates out, the next one animates in.' },
    { id: 'glass', name: 'Glass', hint: 'Duplicate your footage on the track above (Alt-drag), select the copy and apply. The copy becomes frosted glass.' },
    { id: 'styles', name: 'Styles', hint: 'One-click looks: shadows, cards, picture-in-picture and more.' },
    { id: 'loops', name: 'Loops', hint: 'Expression-style motion baked across the whole clip: float, sway, handheld, Ken Burns.' }
  ];

  var P = [];

  // ---------------------------------------------------------------- Easing
  Easing.CURVES.forEach(function (c) {
    P.push({
      id: 'ease-' + c.id, cat: 'easing', kind: 'ease', name: c.name, desc: c.desc, curve: c.id,
      custom: c.custom ? c.type : null,
      defaults: {
        curve: c.id,
        bezier: c.type === 'bezier' ? c.v.slice() : [0.25, 0.1, 0.25, 1],
        spring: c.type === 'spring' ? c.v.slice() : [0.5, 0.8],
        minGap: 3
      }
    });
  });

  // ---------------------------------------------------------------- Text
  function text(id, name, desc, from, curve, duration, extra) {
    var p = { id: id, cat: 'text', kind: 'anim', name: name, desc: desc, from: from,
      defaults: { curve: curve, duration: duration, intensity: 100, where: 'in', motionBlur: false } };
    if (extra) for (var k in extra) p[k] = extra[k];
    P.push(p);
  }
  text('text-fade-up', 'Fade Up', 'Rises gently into place while fading in.', { ty: 0.05, o: 0 }, 'keynote-smooth', 0.8);
  text('text-blur-in', 'Blur In', 'Comes into focus from a soft blur.', { o: 0, blur: 30, s: 1.06 }, 'apple-default', 0.9);
  text('text-keynote-rise', 'Keynote Rise', 'The signature keynote title: rise, blur and fade.', { ty: 0.08, o: 0, blur: 14 }, 'spring-smooth', 1.0);
  text('text-scale-pop', 'Scale Pop', 'Pops in from small with a springy overshoot.', { s: 0.6, o: 0 }, 'spring-bouncy', 0.8);
  text('text-zoom-blur', 'Zoom Blur In', 'Settles in from large and out of focus.', { s: 1.4, o: 0, blur: 24 }, 'keynote-smooth', 0.8);
  text('text-slide-left', 'Slide From Left', 'Slides in from the left with a spring.', { tx: -0.12, o: 0 }, 'spring-snappy', 0.8);
  text('text-slide-right', 'Slide From Right', 'Slides in from the right with a spring.', { tx: 0.12, o: 0 }, 'spring-snappy', 0.8);
  text('text-drop-in', 'Drop In', 'Drops from above and bounces into place.', { ty: -0.12, o: 0 }, 'spring-bouncy', 0.9);
  text('text-wipe', 'Wipe Reveal', 'Clean left-to-right reveal.', { crop: [0, 0, 100, 0] }, 'ios-sheet', 0.9);
  text('text-wipe-up', 'Wipe Up', 'Reveals from the bottom edge upward.', { crop: [0, 100, 0, 0] }, 'ios-sheet', 0.9);
  text('text-rotate-in', 'Tilt In', 'Rotates slightly and rises into place.', { r: -8, ty: 0.04, o: 0 }, 'spring-snappy', 0.9);
  text('text-soft-focus', 'Soft Focus', 'Slow dreamy focus pull with fade.', { blur: 40, o: 0 }, 'ease-in-out', 1.2);

  // ---------------------------------------------------------------- Transitions
  function trans(id, name, desc, exit, enter, curve, duration, extra) {
    var p = { id: id, cat: 'transitions', kind: 'transition', name: name, desc: desc, exit: exit, enter: enter,
      defaults: { curve: curve, duration: duration, intensity: 100, motionBlur: true } };
    if (extra) for (var k in extra) p[k] = extra[k];
    P.push(p);
  }
  trans('tr-push-left', 'Push Left', 'Content pushes out to the left, next clip slides in from the right.', { tx: -1 }, { tx: 1 }, 'keynote-emphasis', 0.45);
  trans('tr-push-right', 'Push Right', 'Content pushes out to the right, next clip slides in from the left.', { tx: 1 }, { tx: -1 }, 'keynote-emphasis', 0.45);
  trans('tr-push-up', 'Push Up', 'Swipes up like switching apps.', { ty: -1 }, { ty: 1 }, 'ios-sheet', 0.45);
  trans('tr-push-down', 'Push Down', 'Swipes down to the next clip.', { ty: 1 }, { ty: -1 }, 'ios-sheet', 0.45);
  trans('tr-whip', 'Whip Pan', 'Fast whip with heavy motion blur.', { tx: -1.2, blur: 20 }, { tx: 1.2, blur: 20 }, 'dramatic', 0.3);
  trans('tr-zoom-through', 'Zoom Through', 'Flies through the outgoing clip into the next one.', { s: 2.2, o: 0, blur: 30 }, { s: 0.6, o: 0, blur: 20 }, 'keynote-smooth', 0.5);
  trans('tr-blur-cut', 'Blur Cut', 'Defocuses out, refocuses on the next clip.', { blur: 60 }, { blur: 60 }, 'ease-in-out', 0.4);
  trans('tr-spin', 'Spin', 'Rotational swirl with blur.', { r: 25, s: 1.3, blur: 20 }, { r: -25, s: 1.3, blur: 20 }, 'dramatic', 0.45);
  trans('tr-keynote-dissolve', 'Keynote Dissolve', 'Recedes and fades, next clip settles in.', { s: 0.9, o: 0 }, { s: 1.08, o: 0 }, 'apple-default', 0.5);
  trans('tr-stack-slide', 'Stack Slide', 'Outgoing clip recedes and dims, next slides over it.', { s: 0.9, bright: -60 }, { tx: 1 }, 'ios-sheet', 0.5);
  trans('tr-dip-black', 'Dip To Black', 'Classic fade through black.', { o: 0 }, { o: 0 }, 'ease-in-out', 0.5);

  // ---------------------------------------------------------------- Glass
  function glass(id, name, desc, rest, extra) {
    var p = { id: id, cat: 'glass', kind: 'static', name: name, desc: desc, rest: rest,
      defaults: { blur: rest.blur, tint: rest.bright || 0, shadow: 60, curve: 'spring-snappy', duration: 0.8, where: 'in', motionBlur: false } };
    if (extra) for (var k in extra) p[k] = extra[k];
    if (p.from) p.kind = 'anim';
    P.push(p);
  }
  var softShadow = { opacity: 45, distance: 18, softness: 60, direction: 180 };
  glass('glass-frosted', 'Frosted Glass', 'Full-frame frosted blur, perfect behind titles.', { blur: 60, bright: 8 });
  glass('glass-dark', 'Dark Glass', 'Dimmed frosted backdrop, like a modal sheet.', { blur: 60, bright: -30 });
  glass('glass-card', 'Glass Card', 'Centered frosted card with soft shadow.', { blur: 60, bright: 14, crop: [22, 22, 22, 22] }, { shadow: softShadow, feather: 2 });
  glass('glass-bottom-bar', 'Glass Bottom Bar', 'Frosted lower bar for captions.', { blur: 60, bright: 14, crop: [6, 72, 6, 8] }, { shadow: softShadow, feather: 2 });
  glass('glass-sidebar', 'Glass Sidebar', 'Frosted side panel.', { blur: 60, bright: 14, crop: [4, 8, 70, 8] }, { shadow: softShadow, feather: 2 });
  glass('glass-menu-bar', 'Glass Menu Bar', 'Thin frosted strip at the top.', { blur: 50, bright: 18, crop: [0, 0, 0, 93] }, { feather: 1 });
  glass('glass-card-pop', 'Glass Card Pop', 'Glass card that springs into view.', { blur: 60, bright: 14, crop: [22, 22, 22, 22] },
    { shadow: softShadow, feather: 2, from: { s: 0.85, o: 0 }, defaults: { blur: 60, tint: 14, shadow: 60, curve: 'spring-bouncy', duration: 0.8, where: 'in', motionBlur: false } });
  glass('glass-notification', 'Glass Notification', 'Banner that drops in from the top like a notification.', { blur: 60, bright: 16, crop: [60, 5, 4, 80] },
    { shadow: softShadow, feather: 2, from: { ty: -0.25 }, defaults: { blur: 60, tint: 16, shadow: 60, curve: 'spring-snappy', duration: 0.8, where: 'both', motionBlur: false } });
  glass('glass-blur-in', 'Glass Blur In', 'Background gradually turns into frosted glass.', { blur: 60, bright: 8 },
    { from: { blur: 0, bright: 0 }, defaults: { blur: 60, tint: 8, shadow: 0, curve: 'ease-in-out', duration: 1.0, where: 'in', motionBlur: false } });

  // ---------------------------------------------------------------- Styles
  function style(id, name, desc, rest, extra) {
    var p = { id: id, cat: 'styles', kind: 'static', name: name, desc: desc, rest: rest || {},
      defaults: { shadow: 60 } };
    if (extra) for (var k in extra) p[k] = extra[k];
    P.push(p);
  }
  var cardShadow = { opacity: 55, distance: 24, softness: 80, direction: 180 };
  style('st-soft-shadow', 'Soft Shadow', 'Subtle shadow under titles and graphics.', {}, { shadow: { opacity: 45, distance: 12, softness: 50, direction: 180 } });
  style('st-deep-shadow', 'Deep Shadow', 'Large diffuse shadow for floating elements.', {}, { shadow: { opacity: 70, distance: 30, softness: 110, direction: 180 } });
  style('st-floating-card', 'Floating Card', 'Scales the clip into a floating card with shadow.', { s: 0.86 }, { shadow: cardShadow });
  style('st-pip-tl', 'PiP Top Left', 'Picture-in-picture, top left.', { s: 0.3, tx: -0.32, ty: -0.3 }, { shadow: cardShadow });
  style('st-pip-tr', 'PiP Top Right', 'Picture-in-picture, top right.', { s: 0.3, tx: 0.32, ty: -0.3 }, { shadow: cardShadow });
  style('st-pip-bl', 'PiP Bottom Left', 'Picture-in-picture, bottom left.', { s: 0.3, tx: -0.32, ty: 0.3 }, { shadow: cardShadow });
  style('st-pip-br', 'PiP Bottom Right', 'Picture-in-picture, bottom right.', { s: 0.3, tx: 0.32, ty: 0.3 }, { shadow: cardShadow });
  style('st-cinematic', 'Cinematic Bars', 'Letterbox bars for a widescreen look.', { crop: [0, 12, 0, 12] });
  style('st-mono', 'Mono', 'Clean black and white.', {}, { bw: true });
  style('st-dim', 'Dim', 'Darkens the clip so text on top pops.', { bright: -40 });

  // ---------------------------------------------------------------- Loops
  function loop(id, name, desc, lp, rest) {
    P.push({ id: id, cat: 'loops', kind: 'loop', name: name, desc: desc, loop: lp, rest: rest || {},
      defaults: { intensity: 100, speed: 100, motionBlur: false } });
  }
  loop('lp-float', 'Float', 'Gentle up and down hover.', { ty: { type: 'sin', amp: 0.012, period: 3 } });
  loop('lp-breathe', 'Breathe', 'Slow scale in and out.', { s: { type: 'sin', amp: 0.02, period: 4 } });
  loop('lp-sway', 'Sway', 'Soft pendulum rotation.', { r: { type: 'sin', amp: 1.5, period: 5 } });
  loop('lp-orbit', 'Orbit', 'Small circular drift.', { tx: { type: 'sin', amp: 0.008, period: 6 }, ty: { type: 'cos', amp: 0.008, period: 6 } });
  loop('lp-handheld', 'Handheld', 'Organic camera shake, like a handheld shot.',
    { tx: { type: 'noise', amp: 0.004, period: 1.6 }, ty: { type: 'noise', amp: 0.004, period: 1.8 }, r: { type: 'noise', amp: 0.35, period: 2.2 } }, { s: 1.03 });
  loop('lp-kenburns-in', 'Ken Burns In', 'Slow push in across the clip.', { s: { type: 'ramp', a: 1, b: 1.15 } });
  loop('lp-kenburns-out', 'Ken Burns Out', 'Slow pull out across the clip.', { s: { type: 'ramp', a: 1.15, b: 1 } });
  loop('lp-drift', 'Drift Pan', 'Slow sideways camera drift.', { tx: { type: 'ramp', a: -0.03, b: 0.03 } }, { s: 1.08 });
  loop('lp-pulse', 'Pulse', 'Rhythmic opacity pulse.', { o: { type: 'pulse', amp: 0.35, period: 2 } });

  var byId = {};
  P.forEach(function (p) { byId[p.id] = p; });

  var api = { CATEGORIES: CATEGORIES, PRESETS: P, byId: byId };
  root.AFX = root.AFX || {};
  root.AFX.Presets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
