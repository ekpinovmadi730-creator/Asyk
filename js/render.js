/* Отрисовка поля, асыков, сақа, прицела и эффектов на canvas. */
(function () {
  'use strict';

  var WORLD = window.AsykWorld;

  var C = {
    night: '#14213d',
    night2: '#0d1730',
    gold: '#f2b53a',
    goldSoft: '#f7d27c',
    felt: '#8e2a2a',
    feltDeep: '#621a1c',
    sky: '#00a7c2',
    bone: '#f3e6c8',
    bone2: '#d9c395',
    chalk: 'rgba(255, 248, 230, 0.92)'
  };

  /* Детерминированный генератор, чтобы текстура земли не «мигала». */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Мотив «қошқар мүйіз» — два закрученных рога. Центр основания в (0,0), высота ~s. */
  function hornPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0, -0.62 * s, -0.22 * s, -s, -0.55 * s, -s);
    ctx.bezierCurveTo(-0.88 * s, -s, -1.0 * s, -0.66 * s, -0.8 * s, -0.46 * s);
    ctx.bezierCurveTo(-0.64 * s, -0.3 * s, -0.44 * s, -0.4 * s, -0.48 * s, -0.56 * s);
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0, -0.62 * s, 0.22 * s, -s, 0.55 * s, -s);
    ctx.bezierCurveTo(0.88 * s, -s, 1.0 * s, -0.66 * s, 0.8 * s, -0.46 * s);
    ctx.bezierCurveTo(0.64 * s, -0.3 * s, 0.44 * s, -0.4 * s, 0.48 * s, -0.56 * s);
  }

  function diamond(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y);
    ctx.closePath();
  }

  /* ---------- статичный фон поля (кэшируется) ---------- */

  function buildBoard(level, scale, label) {
    var W = WORLD.W, H = WORLD.H, WALL = WORLD.WALL;
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(W * scale));
    cv.height = Math.max(1, Math.round(H * scale));
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);

    // рамка-текемет
    var frame = ctx.createLinearGradient(0, 0, 0, H);
    frame.addColorStop(0, '#9b302d');
    frame.addColorStop(1, C.feltDeep);
    roundRect(ctx, 0, 0, W, H, 36);
    ctx.fillStyle = frame;
    ctx.fill();

    // орнамент по рамке
    ctx.save();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    var step = 70;
    var i, x, y;
    for (x = WALL + step / 2; x < W - WALL; x += step) {
      ctx.save(); ctx.translate(x, WALL - 7); hornPath(ctx, 22); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.translate(x, H - WALL + 7); ctx.scale(1, -1); hornPath(ctx, 22); ctx.stroke(); ctx.restore();
    }
    for (y = WALL + step / 2; y < H - WALL; y += step) {
      ctx.save(); ctx.translate(WALL - 7, y); ctx.rotate(Math.PI / 2); hornPath(ctx, 22); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.translate(W - WALL + 7, y); ctx.rotate(-Math.PI / 2); hornPath(ctx, 22); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = C.gold;
    [[WALL / 2, WALL / 2], [W - WALL / 2, WALL / 2], [WALL / 2, H - WALL / 2], [W - WALL / 2, H - WALL / 2]].forEach(function (p) {
      diamond(ctx, p[0], p[1], 12); ctx.fill();
    });
    ctx.restore();

    // земля
    var gx = WALL, gy = WALL, gw = W - WALL * 2, gh = H - WALL * 2;
    ctx.save();
    roundRect(ctx, gx, gy, gw, gh, 14);
    ctx.clip();
    var c0 = level.rings[0];
    var ground = ctx.createRadialGradient(W / 2, c0.y, 60, W / 2, c0.y + 200, 1100);
    if (level.sand) {
      ground.addColorStop(0, '#ecd29a');
      ground.addColorStop(0.55, '#dcb877');
      ground.addColorStop(1, '#b98f55');
    } else {
      ground.addColorStop(0, '#d8b27a');
      ground.addColorStop(0.55, '#c49660');
      ground.addColorStop(1, '#9c7143');
    }
    ctx.fillStyle = ground;
    ctx.fillRect(gx, gy, gw, gh);

    // зерно и камушки
    var rand = rng(1337 + (typeof level.id === 'number' ? level.id : 11) * 97);
    for (i = 0; i < (level.sand ? 5200 : 2600); i++) {
      var px = gx + rand() * gw, py = gy + rand() * gh;
      var r = rand() * 2.2 + 0.4;
      ctx.fillStyle = rand() < 0.5 ? 'rgba(90, 60, 30, 0.16)' : 'rgba(255, 240, 210, 0.14)';
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    }
    for (i = 0; i < 40; i++) {
      var sx = gx + rand() * gw, sy = gy + rand() * gh;
      ctx.fillStyle = 'rgba(80, 55, 30, 0.22)';
      ctx.beginPath(); ctx.ellipse(sx, sy, 3 + rand() * 5, 2 + rand() * 3, rand() * 3, 0, Math.PI * 2); ctx.fill();
    }
    // пучки ковыля по краям
    ctx.strokeStyle = 'rgba(110, 120, 60, 0.45)';
    ctx.lineWidth = 2;
    for (i = 0; i < 60; i++) {
      var edge = rand();
      var tx = edge < 0.5 ? gx + 6 + rand() * 40 : gx + gw - 6 - rand() * 40;
      var ty = gy + rand() * gh;
      for (var k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(tx + (rand() - 0.5) * 12, ty - 10, tx + (rand() - 0.5) * 20, ty - 14 - rand() * 10);
        ctx.stroke();
      }
    }
    // виньетка
    var vig = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 900);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(40, 20, 5, 0.35)');
    ctx.fillStyle = vig;
    ctx.fillRect(gx, gy, gw, gh);

    // время суток: закат теплее, ночь — синяя с лунным светом
    if (level.time === 'sunset') {
      var sun = ctx.createLinearGradient(0, gy, 0, gy + gh);
      sun.addColorStop(0, 'rgba(240, 110, 50, 0.26)');
      sun.addColorStop(1, 'rgba(150, 40, 60, 0.18)');
      ctx.fillStyle = sun;
      ctx.fillRect(gx, gy, gw, gh);
    } else if (level.time === 'night') {
      // «умножаем» на синий — земля темнеет и синеет, а не сереет
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(105, 125, 200)';
      ctx.fillRect(gx, gy, gw, gh);
      ctx.globalCompositeOperation = 'screen';
      var moon = ctx.createRadialGradient(W * 0.72, gy + 80, 20, W * 0.6, gy + 300, 900);
      moon.addColorStop(0, 'rgba(120, 150, 230, 0.35)');
      moon.addColorStop(1, 'rgba(120, 150, 230, 0)');
      ctx.fillStyle = moon;
      ctx.fillRect(gx, gy, gw, gh);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // внутренняя тень рамки
    ctx.save();
    roundRect(ctx, gx, gy, gw, gh, 14);
    ctx.strokeStyle = 'rgba(40, 10, 10, 0.6)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(242, 181, 58, 0.7)';
    ctx.lineWidth = 2;
    roundRect(ctx, gx - 5, gy - 5, gw + 10, gh + 10, 18);
    ctx.stroke();
    ctx.restore();

    level.rings.forEach(function (r) { drawRing(ctx, r); });
    (level.stones || []).forEach(function (st) { drawStone(ctx, st); });
    drawLaunchLine(ctx, label);
    return cv;
  }

  function drawStone(ctx, st) {
    ctx.save();
    ctx.fillStyle = 'rgba(30, 20, 10, 0.4)';
    ctx.beginPath(); ctx.ellipse(st.x + 6, st.y + 9, st.r * 1.05, st.r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(st.x - st.r * 0.4, st.y - st.r * 0.5, 3, st.x, st.y, st.r * 1.2);
    g.addColorStop(0, '#b9b3a8');
    g.addColorStop(0.6, '#7d766c');
    g.addColorStop(1, '#4a443d');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (var i = 0; i <= 10; i++) {
      var a = (i / 10) * Math.PI * 2;
      var rr = st.r * (0.9 + 0.1 * Math.sin(a * 3 + st.x));
      var px = st.x + Math.cos(a) * rr, py = st.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(st.x - st.r * 0.25, st.y - st.r * 0.3, st.r * 0.45, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    ctx.restore();
  }

  function drawRing(ctx, ring) {
    var cx = ring.x, cy = ring.y, R = ring.r;
    var k = Math.min(1, R / 280);
    ctx.save();
    // утоптанная земля внутри кона
    var inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    inner.addColorStop(0, 'rgba(120, 80, 40, 0.10)');
    inner.addColorStop(1, 'rgba(120, 80, 40, 0.22)');
    ctx.fillStyle = inner;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    // шаңырақ в центре
    ctx.strokeStyle = 'rgba(90, 55, 25, 0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 70 * k, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 58 * k, 0, Math.PI * 2); ctx.stroke();
    for (var s = -1; s <= 1; s += 2) {
      ctx.beginPath(); ctx.arc(cx + s * 30 * k, cy, 50 * k, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + s * 30 * k, 50 * k, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    }

    // линия кона — мел
    ctx.strokeStyle = 'rgba(80, 50, 20, 0.35)';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(cx, cy + 2, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C.chalk;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    // золотые рожки снаружи круга
    var n = Math.round((Math.PI * 2 * R) / 90);
    ctx.strokeStyle = 'rgba(142, 42, 42, 0.55)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12));
      ctx.rotate(a + Math.PI / 2);
      hornPath(ctx, 14);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawLaunchLine(ctx, label) {
    var y = WORLD.launchY;
    var x0 = WORLD.WALL + 40, x1 = WORLD.W - WORLD.WALL - 40;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 245, 220, 0.07)';
    ctx.fillRect(x0 - 10, y - WORLD.launchBand, x1 - x0 + 20, WORLD.launchBand * 2);
    ctx.setLineDash([22, 14]);
    ctx.strokeStyle = 'rgba(255, 248, 230, 0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 248, 230, 0.55)';
    ctx.font = '600 24px Nunito, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label || '', WORLD.W / 2, y + WORLD.launchBand - 18);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- асык и сақа ---------- */

  /* Силуэт асыка сверху: «гантелька» с перехватом. hx/hy — полуоси. */
  function asykPath(ctx, hx, hy) {
    ctx.beginPath();
    ctx.moveTo(-hx * 0.55, -hy);
    ctx.bezierCurveTo(-hx * 0.2, -hy * 0.72, hx * 0.2, -hy * 0.72, hx * 0.55, -hy);
    ctx.bezierCurveTo(hx * 1.02, -hy * 1.1, hx * 1.12, -hy * 0.2, hx, 0);
    ctx.bezierCurveTo(hx * 1.12, hy * 0.2, hx * 1.02, hy * 1.1, hx * 0.55, hy);
    ctx.bezierCurveTo(hx * 0.2, hy * 0.72, -hx * 0.2, hy * 0.72, -hx * 0.55, hy);
    ctx.bezierCurveTo(-hx * 1.02, hy * 1.1, -hx * 1.12, hy * 0.2, -hx, 0);
    ctx.bezierCurveTo(-hx * 1.12, -hy * 0.2, -hx * 1.02, -hy * 1.1, -hx * 0.55, -hy);
    ctx.closePath();
  }

  function drawBone(ctx, b, palette, alpha, glow) {
    var hx = b.r * 1.12, hy = b.r * 0.86;
    ctx.save();
    ctx.globalAlpha = alpha;
    // тень
    ctx.save();
    ctx.translate(b.x + 4, b.y + 6);
    ctx.rotate(b.angle);
    ctx.fillStyle = 'rgba(40, 20, 5, 0.35)';
    asykPath(ctx, hx, hy);
    ctx.fill();
    ctx.restore();

    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 22;
    }
    var g = ctx.createRadialGradient(-hx * 0.35, -hy * 0.45, 2, 0, 0, hx * 1.2);
    g.addColorStop(0, palette[0]);
    g.addColorStop(0.55, palette[1]);
    g.addColorStop(1, palette[2]);
    ctx.fillStyle = g;
    asykPath(ctx, hx, hy);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = palette[3];
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // ямка «алшы»
    ctx.fillStyle = palette[4];
    ctx.beginPath(); ctx.ellipse(0, 0, hx * 0.3, hy * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    // блик
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(-hx * 0.5, -hy * 0.45, hx * 0.2, hy * 0.12, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  var ASYK_PALETTE = ['#fffaf0', '#efe0bd', '#c9ad78', 'rgba(110, 80, 40, 0.45)', 'rgba(120, 88, 40, 0.3)'];
  // тяжёлый асык — старый, потемневший, с «свинцовым» блеском
  var HEAVY_PALETTE = ['#f1d9b0', '#b98a55', '#6e4a28', 'rgba(50, 30, 10, 0.6)', 'rgba(40, 40, 50, 0.55)'];

  function sakaPalette(color) {
    return color === 'p2'
      ? ['#ffb3a6', '#d8453a', '#7c1a14', 'rgba(60, 10, 5, 0.6)', 'rgba(60, 10, 5, 0.35)']
      : ['#b9f6ff', '#10a9c4', '#04586a', 'rgba(0, 40, 50, 0.6)', 'rgba(0, 40, 50, 0.35)'];
  }

  /* ---------- прицел ---------- */

  function drawAim(ctx, saka, aim, t) {
    if (!aim) return;
    var dx = aim.dirX, dy = aim.dirY, p = aim.power;
    var pull = aim.pull;
    ctx.save();

    // «резинка» рогатки
    ctx.strokeStyle = 'rgba(40, 20, 10, 0.55)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(saka.x, saka.y);
    ctx.lineTo(saka.x - dx * pull, saka.y - dy * pull);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 248, 230, 0.8)';
    ctx.beginPath(); ctx.arc(saka.x - dx * pull, saka.y - dy * pull, 12, 0, Math.PI * 2); ctx.fill();

    // линия прицела
    var len = 140 + p * 560;
    var col = powerColor(p);
    ctx.setLineDash([18, 14]);
    ctx.lineDashOffset = -t * 60;
    var grad = ctx.createLinearGradient(saka.x, saka.y, saka.x + dx * len, saka.y + dy * len);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(saka.x + dx * (saka.r + 10), saka.y + dy * (saka.r + 10));
    ctx.lineTo(saka.x + dx * len, saka.y + dy * len);
    ctx.stroke();
    ctx.setLineDash([]);

    // наконечник-стрелка
    var ax = saka.x + dx * (saka.r + 34 + p * 30), ay = saka.y + dy * (saka.r + 34 + p * 30);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ax + dx * 18, ay + dy * 18);
    ctx.lineTo(ax - dy * 12, ay + dx * 12);
    ctx.lineTo(ax + dy * 12, ay - dx * 12);
    ctx.closePath();
    ctx.fill();

    // шкала силы — дуга вокруг сақа
    var R = saka.r + 22;
    var start = Math.PI * 0.75, sweep = Math.PI * 1.5;
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(13, 23, 48, 0.55)';
    ctx.beginPath(); ctx.arc(saka.x, saka.y, R, start, start + sweep); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(saka.x, saka.y, R, start, start + sweep * p); ctx.stroke();
    ctx.restore();

    // подпись силы
    ctx.save();
    ctx.font = '800 26px Nunito, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(13, 23, 48, 0.8)';
    var label = Math.round(p * 100) + '%';
    var ly = saka.y + R + 34;
    ctx.fillText(label, saka.x + 2, ly + 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, saka.x, ly);
    ctx.restore();
  }

  function powerColor(p) {
    if (p < 0.45) return '#6fe39a';
    if (p < 0.8) return C.gold;
    return '#ff6a4d';
  }

  /* Подсказка-«призрак» для обучения: палец тянет сақа назад. */
  function drawGhost(ctx, saka, t) {
    var cycle = (t % 2.2) / 2.2;
    var pull = Math.min(1, cycle / 0.7) * 170;
    var fade = cycle < 0.8 ? 1 : 1 - (cycle - 0.8) / 0.2;
    ctx.save();
    ctx.globalAlpha = 0.9 * fade;
    // пульс вокруг сақа
    ctx.strokeStyle = '#7fe3f2';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(saka.x, saka.y, saka.r + 14 + Math.sin(t * 6) * 5, 0, Math.PI * 2); ctx.stroke();
    // стрелка вперёд
    ctx.setLineDash([14, 12]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.moveTo(saka.x, saka.y - saka.r - 20); ctx.lineTo(saka.x, saka.y - saka.r - 20 - pull * 1.6); ctx.stroke();
    ctx.setLineDash([]);
    // палец
    var fx = saka.x, fy = saka.y + pull;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath(); ctx.arc(fx, fy, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0, 167, 194, 0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(fx, fy, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /* ---------- главный кадр ---------- */

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.board = null;
    this.boardLevel = null;
    this.dpr = 1;
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
  }

  Renderer.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.scale = Math.min(rect.width / WORLD.W, rect.height / WORLD.H);
    this.ox = (rect.width - WORLD.W * this.scale) / 2;
    this.oy = (rect.height - WORLD.H * this.scale) / 2;
    this.board = null; // перестроим фон под новый размер
  };

  /* Экранные координаты (CSS px относительно canvas) → мировые. */
  Renderer.prototype.toWorld = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.ox) / this.scale,
      y: (clientY - rect.top - this.oy) / this.scale
    };
  };

  Renderer.prototype.draw = function (g, t) {
    var ctx = this.ctx;
    var k = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!g.level) return;

    var label = g.labels.launch;
    if (!this.board || this.boardLevel !== g.level || this.boardLabel !== label) {
      this.board = buildBoard(g.level, k, label);
      this.boardLevel = g.level;
      this.boardLabel = label;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.board, Math.round(this.ox * this.dpr), Math.round(this.oy * this.dpr));

    ctx.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);

    var i, a;
    // асыки на поле
    for (i = 0; i < g.asyks.length; i++) {
      a = g.asyks[i];
      if (!a.active) continue;
      var outside = g.isOutside(a);
      drawBone(ctx, a, a.heavy ? HEAVY_PALETTE : ASYK_PALETTE, 1, outside ? 'rgba(247, 210, 124, 0.95)' : null);
    }
    // выбитые — улетают и тают
    for (i = 0; i < g.fading.length; i++) {
      var f = g.fading[i];
      var p = Math.max(0, Math.min(1, f.t / f.dur));
      var e = 1 - Math.pow(1 - p, 3);
      var fx = f.x + (f.tx - f.x) * e, fy = f.y + (f.ty - f.y) * e;
      drawBone(ctx, { x: fx, y: fy, r: f.r * (1 - 0.4 * e), angle: f.angle + e * 6 }, f.heavy ? HEAVY_PALETTE : ASYK_PALETTE, 1 - p * 0.8, 'rgba(247, 210, 124, 0.9)');
    }

    // след за летящей сақа
    if (g.trail.length > 1) {
      var tc = g.currentColor() === 'p2' ? '224, 82, 74' : '0, 167, 194';
      for (i = 1; i < g.trail.length; i++) {
        var q0 = i / g.trail.length;
        ctx.strokeStyle = 'rgba(' + tc + ',' + (q0 * 0.45).toFixed(3) + ')';
        ctx.lineWidth = g.saka.r * 1.3 * q0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(g.trail[i - 1].x, g.trail[i - 1].y);
        ctx.lineTo(g.trail[i].x, g.trail[i].y);
        ctx.stroke();
      }
    }

    if (g.saka && g.saka.active) {
      if (g.state === 'aim' && g.showGhost && !g.aim) drawGhost(ctx, g.saka, t);
      drawBone(ctx, g.saka, sakaPalette(g.currentColor()), 1, g.state === 'aim' && !g.aim ? 'rgba(255,255,255,0.35)' : null);
      if (g.state === 'aim') drawAim(ctx, g.saka, g.aim, t);
      if (g.botThinking) drawThinking(ctx, g.saka, t);
    }

    // пыль от ударов
    for (i = 0; i < g.particles.length; i++) {
      var d = g.particles[i];
      var life = 1 - d.t / d.dur;
      ctx.fillStyle = 'rgba(' + d.color + ',' + (life * d.alpha).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(d.x, d.y, d.size * (1.4 - life * 0.4), 0, Math.PI * 2); ctx.fill();
    }

    // всплывающие очки
    ctx.textAlign = 'center';
    for (i = 0; i < g.popups.length; i++) {
      var pu = g.popups[i];
      var q = pu.t / pu.dur;
      ctx.globalAlpha = 1 - q;
      ctx.font = '700 ' + Math.round(46 + q * 10) + 'px Philosopher, Georgia, serif';
      ctx.fillStyle = C.feltDeep;
      ctx.fillText(pu.text, pu.x + 2, pu.y - q * 90 + 3);
      ctx.fillStyle = C.goldSoft;
      ctx.fillText(pu.text, pu.x, pu.y - q * 90);
    }
    ctx.globalAlpha = 1;

    if (g.state === 'replay') drawReplayBanner(ctx, g.labels.replay, t);
  };

  function drawThinking(ctx, saka, t) {
    ctx.save();
    for (var i = 0; i < 3; i++) {
      var a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 6 - i * 0.8));
      ctx.fillStyle = 'rgba(255, 248, 230,' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(saka.x - 26 + i * 26, saka.y - saka.r - 34, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawReplayBanner(ctx, text, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(5, 10, 25, 0.55)';
    ctx.fillRect(WORLD.WALL, WORLD.WALL, WORLD.W - WORLD.WALL * 2, 70);
    ctx.fillRect(WORLD.WALL, WORLD.H - WORLD.WALL - 70, WORLD.W - WORLD.WALL * 2, 70);
    ctx.fillStyle = Math.sin(t * 5) > 0 ? '#ff5a4d' : 'rgba(255, 90, 77, 0.35)';
    ctx.beginPath(); ctx.arc(WORLD.W / 2 - 110, WORLD.WALL + 35, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 36px Philosopher, Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, WORLD.W / 2 - 88, WORLD.WALL + 37);
    ctx.restore();
  }

  window.AsykRenderer = Renderer;
})();
