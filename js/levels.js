/* Уровни (коны). Координаты — в мировых единицах поля 1000×1400. */
(function () {
  'use strict';

  var CX = 500;
  var CY = 520;

  function row(count, spacing, y, offset) {
    var list = [];
    var start = CX - ((count - 1) * spacing) / 2 + (offset || 0);
    for (var i = 0; i < count; i++) list.push({ x: start + i * spacing, y: y });
    return list;
  }

  window.AsykLevels = [
    {
      id: 1,
      name: 'Бастау',
      subtitle: 'Начало',
      desc: '5 асыков в ряд, небольшой кон',
      radius: 280,
      asykFriction: 1050,
      asyks: row(5, 62, CY)
    },
    {
      id: 2,
      name: 'Қос қатар',
      subtitle: 'Двойной ряд',
      desc: '7 асыков в два ряда, кон шире',
      radius: 310,
      asykFriction: 1150,
      asyks: row(4, 56, CY + 24).concat(row(3, 56, CY - 24))
    },
    {
      id: 3,
      name: 'Шаңырақ',
      subtitle: 'Крест под куполом',
      desc: '9 асыков крестом, широкий кон, тяжёлые асыки',
      radius: 340,
      asykFriction: 1300,
      asyks: row(5, 50, CY).concat([
        { x: CX, y: CY - 100 }, { x: CX, y: CY - 50 },
        { x: CX, y: CY + 50 }, { x: CX, y: CY + 100 }
      ])
    }
  ];

  window.AsykWorld = {
    W: 1000,
    H: 1400,
    WALL: 42,          // толщина орнаментальной рамки-борта
    ringX: CX,
    ringY: CY,
    launchY: 1110,     // линия броска
    launchBand: 120,   // зона, где можно нажать, чтобы переставить сақа
    throwsPerRound: 5
  };
})();
