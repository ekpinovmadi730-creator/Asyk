/* Простая 2D-физика кругов: трение скольжения, упругие столкновения
   с учётом масс, отскоки от бортов. Шаг фиксированный — результат
   зависит только от броска. */
(function () {
  'use strict';

  var STEP = 1 / 240;         // фиксированный шаг симуляции, с
  var AIR_DAMP = 0.35;        // вязкое затухание, 1/с
  var BODY_E = 0.86;          // упругость удара кость о кость
  var WALL_E = 0.55;          // упругость удара о борт
  var TANGENT_MU = 0.12;      // трение при скользящем касании
  var SPIN_DECAY = 2.2;       // затухание вращения, 1/с
  var REST_SPEED = 3;         // ниже этой скорости тело считается остановившимся

  function Body(opts) {
    this.id = opts.id;
    this.kind = opts.kind;          // 'saka' | 'asyk'
    this.x = opts.x;
    this.y = opts.y;
    this.vx = 0;
    this.vy = 0;
    this.r = opts.r;
    this.m = opts.m;
    this.friction = opts.friction;  // замедление скольжения, ед/с²
    this.angle = opts.angle || 0;
    this.spin = 0;
    this.active = true;             // участвует в физике
  }

  Body.prototype.speed = function () { return Math.hypot(this.vx, this.vy); };

  function integrate(b, dt, bounds, events) {
    var s = Math.hypot(b.vx, b.vy);
    if (s > 0) {
      var ns = (s - b.friction * dt) * (1 - AIR_DAMP * dt);
      if (ns <= 0) { b.vx = 0; b.vy = 0; }
      else { b.vx *= ns / s; b.vy *= ns / s; }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.angle += b.spin * dt;
    b.spin *= Math.max(0, 1 - SPIN_DECAY * dt * (s < 20 ? 4 : 1));

    var minX = bounds.minX + b.r, maxX = bounds.maxX - b.r;
    var minY = bounds.minY + b.r, maxY = bounds.maxY - b.r;
    if (b.x < minX && b.vx < 0) { b.x = minX; wallHit(b, 'x', events); }
    else if (b.x > maxX && b.vx > 0) { b.x = maxX; wallHit(b, 'x', events); }
    if (b.y < minY && b.vy < 0) { b.y = minY; wallHit(b, 'y', events); }
    else if (b.y > maxY && b.vy > 0) { b.y = maxY; wallHit(b, 'y', events); }
  }

  function wallHit(b, axis, events) {
    var vn = axis === 'x' ? b.vx : b.vy;
    if (axis === 'x') { b.vx = -b.vx * WALL_E; b.vy *= 0.92; b.spin += b.vy / b.r * 0.2; }
    else { b.vy = -b.vy * WALL_E; b.vx *= 0.92; b.spin -= b.vx / b.r * 0.2; }
    if (Math.abs(vn) > 60) events.push({ type: 'wall', strength: Math.min(1, Math.abs(vn) / 1400) });
  }

  function collide(a, b, events) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var minDist = a.r + b.r;
    var d2 = dx * dx + dy * dy;
    if (d2 >= minDist * minDist) return;
    var dist = Math.sqrt(d2);
    var nx, ny;
    if (dist < 1e-6) { nx = 1; ny = 0; dist = 1e-6; }
    else { nx = dx / dist; ny = dy / dist; }

    var ia = 1 / a.m, ib = 1 / b.m, isum = ia + ib;

    // разводим пересекающиеся круги пропорционально массам
    var overlap = minDist - dist;
    a.x -= nx * overlap * (ia / isum);
    a.y -= ny * overlap * (ia / isum);
    b.x += nx * overlap * (ib / isum);
    b.y += ny * overlap * (ib / isum);

    var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    var vn = rvx * nx + rvy * ny;
    if (vn >= 0) return; // уже расходятся

    var j = -(1 + BODY_E) * vn / isum;
    a.vx -= j * ia * nx; a.vy -= j * ia * ny;
    b.vx += j * ib * nx; b.vy += j * ib * ny;

    // касательная составляющая: немного трения и закрутка
    var tx = -ny, ty = nx;
    var vt = rvx * tx + rvy * ty;
    var jt = -vt / isum;
    var maxJt = TANGENT_MU * j;
    if (jt > maxJt) jt = maxJt; else if (jt < -maxJt) jt = -maxJt;
    a.vx -= jt * ia * tx; a.vy -= jt * ia * ty;
    b.vx += jt * ib * tx; b.vy += jt * ib * ty;
    a.spin += vt / a.r * 0.35;
    b.spin -= vt / b.r * 0.35;

    events.push({ type: 'hit', strength: Math.min(1, -vn / 1500), a: a, b: b });
  }

  function World(bounds) {
    this.bounds = bounds;
    this.bodies = [];
    this.acc = 0;
  }

  World.prototype.add = function (body) { this.bodies.push(body); return body; };

  World.prototype.step = function (frameDt) {
    var events = [];
    this.acc += Math.min(frameDt, 0.05);
    var list = this.bodies.filter(function (b) { return b.active; });
    while (this.acc >= STEP) {
      this.acc -= STEP;
      for (var i = 0; i < list.length; i++) integrate(list[i], STEP, this.bounds, events);
      for (var k = 0; k < 2; k++) {
        for (var p = 0; p < list.length; p++)
          for (var q = p + 1; q < list.length; q++) collide(list[p], list[q], events);
      }
    }
    return events;
  };

  World.prototype.isSettled = function () {
    for (var i = 0; i < this.bodies.length; i++) {
      var b = this.bodies[i];
      if (b.active && b.speed() > REST_SPEED) return false;
    }
    return true;
  };

  World.prototype.freeze = function () {
    this.bodies.forEach(function (b) { b.vx = 0; b.vy = 0; b.spin = 0; });
  };

  window.AsykPhysics = { Body: Body, World: World };
})();
