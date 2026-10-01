/* Компьютерный соперник. Перебирает варианты броска на копии поля,
   выбирает лучший и добавляет «человеческую» неточность по сложности.
   Считает небольшими порциями, чтобы телефон не подвисал. */
(function () {
  'use strict';

  var WORLD = window.AsykWorld;

  var PROFILES = {
    easy:   { tries: 18,  angleNoise: 0.10,  powerNoise: 0.14 },
    medium: { tries: 50,  angleNoise: 0.045, powerNoise: 0.07 },
    hard:   { tries: 120, angleNoise: 0.015, powerNoise: 0.025 }
  };

  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function outside(b, rings) {
    var r = rings[b.ring] || rings[0];
    return Math.hypot(b.x - r.x, b.y - r.y) > r.r;
  }

  function insideAny(b, rings) {
    return rings.some(function (r) { return Math.hypot(b.x - r.x, b.y - r.y) <= r.r; });
  }

  /* Кандидат: выбираем асык-цель, точку на линии броска и силу. */
  function candidate(targets) {
    var t = targets[Math.floor(Math.random() * targets.length)];
    var minX = WORLD.WALL + 60, maxX = WORLD.W - WORLD.WALL - 60;
    var x = clamp(t.x + (Math.random() - 0.5) * 520, minX, maxX);
    var tx = t.x + (Math.random() - 0.5) * 34;
    var ty = t.y + (Math.random() - 0.5) * 20;
    var dx = tx - x, dy = ty - WORLD.launchY;
    var len = Math.hypot(dx, dy) || 1;
    return { x: x, dirX: dx / len, dirY: dy / len, power: 0.45 + Math.random() * 0.55 };
  }

  function simulate(ctx, shot) {
    var w = ctx.world.clone();
    var saka = w.bodies[ctx.sakaIndex];
    saka.x = shot.x; saka.y = WORLD.launchY;
    saka.vx = shot.dirX * shot.power * WORLD.maxSpeed;
    saka.vy = shot.dirY * shot.power * WORLD.maxSpeed;
    var t = 0;
    while (t < 12) {
      w.step(1 / 60);
      t += 1 / 60;
      if (t > 0.25 && w.isSettled()) break;
    }
    var score = 0, spread = 0;
    w.bodies.forEach(function (b) {
      if (!b.active || b.kind !== 'asyk') return;
      if (outside(b, ctx.rings)) score += 10;
      else {
        var r = ctx.rings[b.ring] || ctx.rings[0];
        spread += Math.hypot(b.x - r.x, b.y - r.y) / r.r; // ближе к краю — лучше на будущее
      }
    });
    if (ctx.trad && score === 0 && insideAny(saka, ctx.rings)) score -= 6;
    return score + spread * 0.3;
  }

  /* ctx: { world, sakaIndex, rings, trad }. done(shot) вызывается асинхронно.
     Возвращает функцию отмены. */
  function plan(ctx, level, done) {
    var prof = PROFILES[level] || PROFILES.medium;
    var targets = ctx.world.bodies.filter(function (b) { return b.active && b.kind === 'asyk'; });
    var cancelled = false;
    var best = null, bestScore = -Infinity, n = 0;

    function chunk() {
      if (cancelled) return;
      var until = performance.now() + 12;
      while (n < prof.tries && performance.now() < until) {
        var c = candidate(targets);
        var s = simulate(ctx, c);
        if (s > bestScore) { bestScore = s; best = c; }
        n++;
      }
      if (n < prof.tries) { setTimeout(chunk, 0); return; }

      // неточность «руки»: поворот направления и ошибка силы
      var a = gauss() * prof.angleNoise;
      var cos = Math.cos(a), sin = Math.sin(a);
      done({
        x: best.x,
        dirX: best.dirX * cos - best.dirY * sin,
        dirY: best.dirX * sin + best.dirY * cos,
        power: clamp(best.power + gauss() * prof.powerNoise, 0.2, 1)
      });
    }

    if (!targets.length) { setTimeout(function () { if (!cancelled) done({ x: WORLD.W / 2, dirX: 0, dirY: -1, power: 0.6 }); }, 0); }
    else setTimeout(chunk, 0);
    return function () { cancelled = true; };
  }

  window.AsykBot = { plan: plan };
})();
