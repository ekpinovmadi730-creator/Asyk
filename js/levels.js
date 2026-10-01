/* Уровни (коны), размеры поля и генератор «Кона дня».
   Координаты — в мировых единицах поля 1000×1400. */
(function () {
  'use strict';

  var CX = 500;
  var CY = 520;

  /* Детерминированный генератор случайных чисел (mulberry32). */
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

  function row(count, spacing, y, cx, ring) {
    var list = [];
    var start = (cx === undefined ? CX : cx) - ((count - 1) * spacing) / 2;
    for (var i = 0; i < count; i++) list.push({ x: start + i * spacing, y: y, ring: ring || 0 });
    return list;
  }

  function ring(r, x, y) { return { x: x === undefined ? CX : x, y: y === undefined ? CY : y, r: r }; }

  var LEVELS = [
    {
      id: 1, key: 'l1', name: 'Бастау',
      rings: [ring(280)], asykFriction: 1050, sakaFriction: 850, time: 'day',
      asyks: row(5, 62, CY)
    },
    {
      id: 2, key: 'l2', name: 'Қос қатар',
      rings: [ring(310)], asykFriction: 1150, sakaFriction: 850, time: 'day',
      asyks: row(4, 56, CY + 24).concat(row(3, 56, CY - 24))
    },
    {
      id: 3, key: 'l3', name: 'Шаңырақ',
      rings: [ring(340)], asykFriction: 1300, sakaFriction: 850, time: 'sunset',
      asyks: row(5, 50, CY).concat([
        { x: CX, y: CY - 100, ring: 0 }, { x: CX, y: CY - 50, ring: 0 },
        { x: CX, y: CY + 50, ring: 0 }, { x: CX, y: CY + 100, ring: 0 }
      ])
    },
    {
      // песок: всё вязнет, нужен сильный и точный бросок
      id: 4, key: 'l4', name: 'Құм',
      rings: [ring(290)], asykFriction: 1650, sakaFriction: 1050, time: 'day', sand: true,
      asyks: row(6, 56, CY)
    },
    {
      // через один — тяжёлые асыки: их труднее сдвинуть
      id: 5, key: 'l5', name: 'Ауыр асық',
      rings: [ring(300)], asykFriction: 1150, sakaFriction: 850, time: 'sunset',
      asyks: row(7, 58, CY).map(function (a, i) { a.heavy = i % 2 === 1; return a; })
    },
    {
      // камни между линией броска и коном
      id: 6, key: 'l6', name: 'Тастар',
      rings: [ring(300)], asykFriction: 1150, sakaFriction: 850, time: 'night',
      asyks: row(6, 56, CY),
      stones: [{ x: 340, y: 890, r: 34 }, { x: 500, y: 915, r: 34 }, { x: 660, y: 890, r: 34 }]
    },
    {
      // два маленьких кона: асык выбит, когда покинул свой круг
      id: 7, key: 'l7', name: 'Қос кон',
      rings: [ring(170, 290, 560), ring(170, 710, 560)], asykFriction: 1250, sakaFriction: 850, time: 'night',
      asyks: row(3, 52, 584, 290, 0).concat(row(2, 52, 532, 290, 0), row(3, 52, 584, 710, 1), row(2, 52, 532, 710, 1))
    }
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* «Кон дня»: расстановка зависит только от даты — у всех одинаковая. */
  function daily(date) {
    var d = date || new Date();
    var key = dateKey(d);
    var r = rng((d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) * 7919);
    var R = 280 + Math.floor(r() * 50);
    var count = 5 + Math.floor(r() * 3);
    var type = Math.floor(r() * 4);
    var asyks = [];
    var i;

    if (type === 0) {
      asyks = row(count, 54 + Math.floor(r() * 10), CY);
    } else if (type === 1) {
      var front = Math.ceil(count / 2);
      asyks = row(front, 56, CY + 26).concat(row(count - front, 56, CY - 26));
    } else if (type === 2) {
      var arcR = 190, a0 = -2.45, a1 = -0.69;
      for (i = 0; i < count; i++) {
        var a = a0 + (a1 - a0) * (i / (count - 1));
        asyks.push({ x: CX + Math.cos(a) * arcR, y: CY + 110 + Math.sin(a) * arcR, ring: 0 });
      }
    } else {
      var tries = 0;
      while (asyks.length < count && tries++ < 500) {
        var px = CX + (r() * 2 - 1) * R * 0.5;
        var py = CY + (r() * 2 - 1) * R * 0.5;
        if (Math.hypot(px - CX, py - CY) > R * 0.5) continue;
        var ok = asyks.every(function (q) { return Math.hypot(q.x - px, q.y - py) >= 56; });
        if (ok) asyks.push({ x: px, y: py, ring: 0 });
      }
    }

    var stones = [];
    if (r() < 0.35) {
      var n = 1 + Math.floor(r() * 2);
      for (i = 0; i < 20 && stones.length < n; i++) {
        var sx = 300 + r() * 400;
        if (stones.every(function (s) { return Math.abs(s.x - sx) > 150; })) stones.push({ x: sx, y: 900, r: 32 });
      }
    }

    return {
      id: 'daily', key: 'daily', name: 'Күн коны', dateKey: key,
      rings: [ring(R)],
      asykFriction: 1050 + Math.floor(r() * 200),
      sakaFriction: 850,
      time: ['day', 'sunset', 'night'][Math.floor(r() * 3)],
      asyks: asyks,
      stones: stones
    };
  }

  window.AsykLevels = { list: LEVELS, daily: daily, dateKey: dateKey, rng: rng };

  window.AsykWorld = {
    W: 1000,
    H: 1400,
    WALL: 42,          // толщина орнаментальной рамки-борта
    launchY: 1110,     // линия броска
    launchBand: 120,   // зона, где можно нажать, чтобы переставить сақа
    throwsPerRound: 5,
    maxPull: 240,      // максимальная оттяжка
    minPull: 28,       // короче — бросок отменяется
    maxSpeed: 2100,    // скорость сақа при 100% силы
    saka: { r: 30, m: 2.4 },
    asyk: { r: 22, m: 1 },
    heavyAsyk: { r: 25, m: 1.8 }
  };
})();
