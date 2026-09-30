/* Синтезированные звуки через Web Audio — без внешних файлов. */
(function () {
  'use strict';

  var ctx = null;
  var enabled = true;
  var lastKnock = 0;
  var noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    var len = Math.floor(ctx.sampleRate * 0.08);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    return ctx;
  }

  /* Сухой костяной «тук». strength 0..1 */
  function knock(strength, pitch) {
    if (!enabled || !ctx) return;
    var now = ctx.currentTime;
    if (now - lastKnock < 0.025) return;
    lastKnock = now;
    var s = Math.max(0.05, Math.min(1, strength));

    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = (pitch || 2200) * (0.9 + Math.random() * 0.2);
    bp.Q.value = 6;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * s, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(now);

    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime((pitch || 2200) / 2.2, now);
    osc.frequency.exponentialRampToValueAtTime((pitch || 2200) / 4, now + 0.05);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.25 * s, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(og).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /* Щипок струны, как у домбры. */
  function pluck(freq, when, vol) {
    var t = ctx.currentTime + (when || 0);
    var osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(freq * 6, t);
    lp.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.35);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(lp).connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.65);
  }

  window.AsykAudio = {
    unlock: ensure,
    setEnabled: function (on) { enabled = !!on; },
    isEnabled: function () { return enabled; },
    hit: function (strength) { knock(strength, 2300); },
    wall: function (strength) { knock(strength * 0.7, 700); },
    throwSound: function (power) {
      if (!enabled || !ctx) return;
      knock(0.3 + power * 0.4, 1200);
    },
    score: function () {
      if (!enabled || !ctx) return;
      pluck(293.66, 0, 0.16);
      pluck(440, 0.09, 0.14);
    },
    win: function () {
      if (!enabled || !ctx) return;
      [293.66, 369.99, 440, 587.33].forEach(function (f, i) { pluck(f, i * 0.12, 0.15); });
    },
    lose: function () {
      if (!enabled || !ctx) return;
      pluck(293.66, 0, 0.14);
      pluck(246.94, 0.16, 0.12);
    }
  };
})();
