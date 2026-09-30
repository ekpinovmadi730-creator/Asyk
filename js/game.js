/* Игровая логика, ввод, экраны и обучение. */
(function () {
  'use strict';

  var WORLD = window.AsykWorld;
  var LEVELS = window.AsykLevels;
  var Store = window.AsykStorage;
  var Sound = window.AsykAudio;
  var Physics = window.AsykPhysics;

  var SAKA = { r: 30, m: 2.4, friction: 850 };
  var ASYK = { r: 22, m: 1 };
  var MAX_PULL = 240;       // максимальная оттяжка, мировые ед.
  var MIN_PULL = 28;        // короче — бросок отменяется
  var MAX_SPEED = 2100;     // скорость сақа при 100% силы, ед/с
  var GRAB_RADIUS = 110;    // насколько близко к сақа можно «схватить»
  var MAX_MOVE_TIME = 12;   // страховка: бросок принудительно завершается
  var PLAYER_COLORS = { p1: '#00a7c2', p2: '#e0524a' };

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('board');
  var renderer = new window.AsykRenderer(canvas);

  /* ---------- состояние партии ---------- */

  var game = {
    mode: 'solo',
    level: null,
    world: null,
    saka: null,
    asyks: [],
    fading: [],
    popups: [],
    players: [],
    current: 0,
    state: 'idle',      // idle | aim | moving | scoring | over
    aim: null,
    paused: false,
    moveTime: 0,
    showGhost: false,
    isOutside: function (a) {
      return Math.hypot(a.x - WORLD.ringX, a.y - WORLD.ringY) > this.level.radius;
    },
    currentColor: function () {
      var p = this.players[this.current];
      return p ? p.color : 'p1';
    }
  };

  var pointer = null; // { id, startX, startY }
  var timers = [];

  function later(fn, ms) {
    var id = setTimeout(function () {
      timers = timers.filter(function (t) { return t !== id; });
      fn();
    }, ms);
    timers.push(id);
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  /* ---------- экраны ---------- */

  function show(name) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('is-active', s.id === 'screen-' + name);
    });
    if (name === 'game') requestAnimationFrame(function () { renderer.resize(); });
    if (name === 'menu') refreshMenu();
  }

  function refreshMenu() {
    var st = Store.get();
    var done = 0;
    for (var i = 1; i <= LEVELS.length; i++) if (st.completed[i]) done++;
    $('menu-progress').textContent = done
      ? 'Пройдено конов: ' + done + ' из ' + LEVELS.length
      : 'Выбей все асыки за 5 бросков';
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function openLevels(mode) {
    game.mode = mode;
    var st = Store.get();
    $('levels-mode').textContent = mode === 'duo' ? 'Вдвоём' : 'Тренировка';
    var list = $('level-list');
    list.replaceChildren();
    LEVELS.forEach(function (lv, idx) {
      var locked = mode === 'solo' && lv.id > st.unlocked;
      var btn = el('button', 'level-card');
      btn.type = 'button';
      btn.disabled = locked;
      btn.appendChild(el('span', 'level-num', locked ? '🔒' : String(lv.id)));
      var info = el('span');
      info.appendChild(el('span', 'level-name', lv.name + ' · ' + lv.subtitle));
      info.appendChild(el('span', 'level-desc', lv.desc));
      btn.appendChild(info);
      var total = lv.asyks.length;
      var bestTxt, cls = 'level-best';
      if (locked) bestTxt = 'Победи в коне ' + (lv.id - 1);
      else if (mode === 'duo') bestTxt = st.duoBest[lv.id] !== undefined ? 'Рекорд: ' + st.duoBest[lv.id] + '/' + total : total + ' асыков';
      else if (st.completed[lv.id]) { bestTxt = '✓ ' + st.best[lv.id] + '/' + total; cls += ' is-done'; }
      else bestTxt = st.best[lv.id] !== undefined ? 'Рекорд: ' + st.best[lv.id] + '/' + total : total + ' асыков';
      btn.appendChild(el('span', cls, bestTxt));
      btn.addEventListener('click', function () { startLevel(idx); });
      list.appendChild(btn);
    });
    show('levels');
  }

  /* ---------- запуск кона ---------- */

  function startLevel(idx) {
    clearTimers();
    var lv = LEVELS[idx];
    game.levelIndex = idx;
    game.level = lv;
    game.world = new Physics.World({
      minX: WORLD.WALL, maxX: WORLD.W - WORLD.WALL,
      minY: WORLD.WALL, maxY: WORLD.H - WORLD.WALL
    });
    game.asyks = lv.asyks.map(function (p, i) {
      return game.world.add(new Physics.Body({
        id: 'a' + i, kind: 'asyk', x: p.x, y: p.y, r: ASYK.r, m: ASYK.m, friction: lv.asykFriction, angle: 0
      }));
    });
    game.saka = game.world.add(new Physics.Body({
      id: 'saka', kind: 'saka', x: WORLD.W / 2, y: WORLD.launchY, r: SAKA.r, m: SAKA.m, friction: SAKA.friction, angle: 0
    }));
    game.fading = [];
    game.popups = [];
    game.players = game.mode === 'duo'
      ? [makePlayer('Игрок 1', 'p1'), makePlayer('Игрок 2', 'p2')]
      : [makePlayer('Вы', 'p1')];
    game.current = 0;
    game.aim = null;
    game.paused = false;
    $('modal-pause').hidden = true;
    pointer = null;

    $('hud-level').textContent = 'Кон ' + lv.id + ' · ' + lv.name;
    buildHud();
    show('game');
    beginTurn(true);

    if (!Store.get().tutorialDone) Coach.start();
    else Coach.stop();
  }

  function makePlayer(name, color) {
    return { name: name, color: color, score: 0, throwsLeft: WORLD.throwsPerRound };
  }

  function beginTurn(first) {
    var s = game.saka;
    s.x = WORLD.W / 2; s.y = WORLD.launchY;
    s.vx = s.vy = 0; s.angle = 0; s.spin = 0; s.active = true;
    game.state = 'aim';
    game.aim = null;
    updateHud();
    if (game.mode === 'duo') toast(first ? 'Начинает ' + currentPlayer().name : 'Ход: ' + currentPlayer().name);
  }

  function currentPlayer() { return game.players[game.current]; }

  /* ---------- HUD ---------- */

  function buildHud() {
    var wrap = $('hud-players');
    wrap.replaceChildren();
    game.players.forEach(function (p) {
      var card = el('div', 'player-card');
      card.style.setProperty('--pc', PLAYER_COLORS[p.color]);
      card.appendChild(el('span', 'player-name', p.name));
      var score = el('span', 'player-score');
      card.appendChild(score);
      var dots = el('span', 'player-throws');
      for (var i = 0; i < WORLD.throwsPerRound; i++) dots.appendChild(el('span', 'throw-dot'));
      card.appendChild(dots);
      p.ui = { card: card, score: score, dots: dots };
      wrap.appendChild(card);
    });
  }

  function updateHud() {
    var total = game.asyks.length;
    game.players.forEach(function (p, i) {
      var active = i === game.current && game.state !== 'over';
      p.ui.card.classList.toggle('is-active', active);
      p.ui.card.classList.toggle('is-waiting', game.players.length > 1 && !active);
      p.ui.score.replaceChildren(document.createTextNode(String(p.score)));
      if (game.mode === 'solo') p.ui.score.appendChild(el('small', null, '/' + total));
      var used = WORLD.throwsPerRound - p.throwsLeft;
      Array.prototype.forEach.call(p.ui.dots.children, function (d, k) { d.classList.toggle('is-used', k < used); });
    });
    var p = currentPlayer();
    var turn = $('hud-turn');
    turn.style.setProperty('--pc', PLAYER_COLORS[p.color]);
    var throwNo = Math.min(WORLD.throwsPerRound, WORLD.throwsPerRound - p.throwsLeft + (game.state === 'aim' ? 1 : 0));
    var who = game.mode === 'duo' ? 'Ход: ' + p.name : 'Ваш ход';
    turn.textContent = who + ' · бросок ' + Math.max(1, throwNo) + '/' + WORLD.throwsPerRound;
  }

  var toastEl = $('toast');
  function toast(text) {
    toastEl.hidden = true;
    void toastEl.offsetWidth; // перезапуск CSS-анимации
    toastEl.textContent = text;
    toastEl.hidden = false;
    later(function () { toastEl.hidden = true; }, 1400);
  }

  /* ---------- ввод: рогатка ---------- */

  function onPointerDown(e) {
    if (game.state !== 'aim' || game.paused || pointer) return;
    Sound.unlock();
    var p = renderer.toWorld(e.clientX, e.clientY);
    var s = game.saka;
    var d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d > GRAB_RADIUS) {
      // нажатие на линии броска — переставляем сақа туда
      if (Math.abs(p.y - WORLD.launchY) > WORLD.launchBand) return;
      var minX = WORLD.WALL + 60, maxX = WORLD.W - WORLD.WALL - 60;
      s.x = Math.max(minX, Math.min(maxX, p.x));
    }
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
    pointer = { id: e.pointerId, startX: p.x, startY: p.y };
    game.aim = { dirX: 0, dirY: -1, pull: 0, power: 0 };
    canvas.classList.add('is-aiming');
    Coach.onGrab();
  }

  function onPointerMove(e) {
    if (!pointer || e.pointerId !== pointer.id || !game.aim) return;
    e.preventDefault();
    var p = renderer.toWorld(e.clientX, e.clientY);
    var dx = pointer.startX - p.x, dy = pointer.startY - p.y;
    var len = Math.hypot(dx, dy);
    var pull = Math.min(MAX_PULL, len);
    if (len > 0.5) { game.aim.dirX = dx / len; game.aim.dirY = dy / len; }
    game.aim.pull = pull;
    game.aim.power = pull / MAX_PULL;
    Coach.onAim(game.aim.power, pull >= MIN_PULL);
  }

  function onPointerUp(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    pointer = null;
    canvas.classList.remove('is-aiming');
    var aim = game.aim;
    game.aim = null;
    if (!aim || game.state !== 'aim') return;
    if (aim.pull < MIN_PULL) { Coach.onCancel(); return; }
    throwSaka(aim);
  }

  function onPointerCancel(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    pointer = null;
    game.aim = null;
    canvas.classList.remove('is-aiming');
  }

  function throwSaka(aim) {
    var s = game.saka;
    var speed = aim.power * MAX_SPEED;
    s.vx = aim.dirX * speed;
    s.vy = aim.dirY * speed;
    s.spin = aim.dirX * 3; // лёгкая закрутка при косом броске — только визуально
    currentPlayer().throwsLeft--;
    game.state = 'moving';
    game.moveTime = 0;
    Sound.throwSound(aim.power);
    updateHud();
    Coach.onThrow();
  }

  /* ---------- ход симуляции ---------- */

  function update(dt) {
    if (game.paused) return;

    if (game.state === 'moving') {
      game.moveTime += dt;
      var events = game.world.step(dt);
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (ev.type === 'hit') Sound.hit(ev.strength);
        else if (ev.type === 'wall') Sound.wall(ev.strength);
      }
      if ((game.moveTime > 0.25 && game.world.isSettled()) || game.moveTime > MAX_MOVE_TIME) {
        game.world.freeze();
        resolveThrow();
      }
    }

    game.fading = game.fading.filter(function (f) { f.t += dt; return f.t < f.dur; });
    game.popups = game.popups.filter(function (p) { p.t += dt; return p.t < p.dur; });
  }

  function resolveThrow() {
    game.state = 'scoring';
    var knocked = game.asyks.filter(function (a) { return a.active && game.isOutside(a); });
    var player = currentPlayer();
    knocked.forEach(function (a, i) {
      a.active = false; // выбитый асык больше не участвует и не будет посчитан снова
      game.fading.push({ x: a.x, y: a.y, r: a.r, angle: a.angle, tx: WORLD.W / 2 + (a.x - WORLD.W / 2) * 0.3, ty: -60, t: -i * 0.12, dur: 0.9 + i * 0.12 });
      game.popups.push({ text: '+1', x: a.x, y: a.y - 30, t: 0, dur: 1.1 });
    });
    player.score += knocked.length;
    if (knocked.length) Sound.score();
    updateHud();

    Coach.onSettle(knocked.length);
    later(nextTurn, knocked.length ? 900 : 450);
  }

  function nextTurn() {
    if (game.state !== 'scoring') return;
    var remaining = game.asyks.filter(function (a) { return a.active; }).length;
    var anyThrows = game.players.some(function (p) { return p.throwsLeft > 0; });
    if (remaining === 0 || !anyThrows) { finish(); return; }

    if (game.players.length > 1) {
      var next = (game.current + 1) % game.players.length;
      if (game.players[next].throwsLeft > 0) game.current = next;
    }
    beginTurn(false);
  }

  /* ---------- итог ---------- */

  function finish() {
    game.state = 'over';
    game.saka.active = false;
    updateHud();
    var lv = game.level;
    var total = game.asyks.length;
    var title = $('result-title');
    var table = $('result-table');
    table.replaceChildren();
    $('result-kicker').textContent = 'Кон ' + lv.id + ' · ' + lv.name;

    if (game.mode === 'solo') {
      var score = game.players[0].score;
      var won = score === total;
      var record = Store.submitScore(lv.id, score, false);
      if (won) Store.completeLevel(lv.id);
      title.textContent = won ? 'Жеңіс! Победа!' : 'Бросков не хватило';
      title.classList.toggle('is-lose', !won);
      setScoreLine('Выбито ', score, ' из ' + total);
      var best = Store.get().best[lv.id];
      $('result-best').textContent = 'Лучший результат: ' + best + ' из ' + total + (record && score > 0 ? ' — новый рекорд!' : '');
      $('btn-next').hidden = !(won && game.levelIndex < LEVELS.length - 1);
      if (won) Sound.win(); else Sound.lose();
    } else {
      var a = game.players[0], b = game.players[1];
      var top = Math.max(a.score, b.score);
      var draw = a.score === b.score;
      title.textContent = draw ? 'Тең! Ничья' : 'Победил ' + (a.score > b.score ? a.name : b.name) + '!';
      title.classList.toggle('is-lose', draw);
      setScoreLine('Выбито всего ', a.score + b.score, ' из ' + total);
      game.players.forEach(function (p) {
        var row = el('div', 'result-row' + (!draw && p.score === top ? ' is-winner' : ''));
        row.style.setProperty('--pc', PLAYER_COLORS[p.color]);
        row.appendChild(el('span', null, p.name));
        row.appendChild(el('b', null, String(p.score)));
        table.appendChild(row);
      });
      var rec = Store.submitScore(lv.id, top, true);
      $('result-best').textContent = 'Рекорд вдвоём на этом коне: ' + Store.get().duoBest[lv.id] + ' из ' + total + (rec && top > 0 ? ' — новый!' : '');
      $('btn-next').hidden = game.levelIndex >= LEVELS.length - 1;
      Sound.win();
    }
    later(function () { show('result'); }, 800);
  }

  function setScoreLine(before, num, after) {
    var line = $('result-score');
    line.replaceChildren(document.createTextNode(before), el('b', null, String(num)), document.createTextNode(after));
  }

  /* ---------- обучение для новичка ---------- */

  var Coach = (function () {
    var box = $('coach'), stepEl = $('coach-step'), textEl = $('coach-text'), skip = $('coach-skip');
    var active = false, step = 0;

    function set(n, head, text, btn) {
      step = n;
      stepEl.textContent = head;
      textEl.textContent = text;
      skip.textContent = btn || 'Пропустить';
      game.showGhost = active && n === 0;
    }
    function finishTutorial() {
      active = false;
      box.hidden = true;
      game.showGhost = false;
      Store.setTutorialDone(true);
    }
    return {
      start: function () {
        active = true;
        box.hidden = false;
        set(0, 'Обучение · 1 из 3', 'Нажми на сақа (цветную биту) и удерживай. Можно нажать и на линии броска — сақа переедет туда.');
      },
      stop: function () { active = false; box.hidden = true; game.showGhost = false; },
      skip: finishTutorial,
      onGrab: function () {
        if (active && step <= 1) set(1, 'Обучение · 2 из 3', 'Тяни назад, как рогатку. Пунктир — куда полетит сақа, дуга вокруг — сила броска.');
      },
      onAim: function (power, enough) {
        if (!active) return;
        if (enough && power > 0.2 && step === 1) set(2, 'Обучение · 3 из 3', 'Отпусти палец или кнопку мыши — бросок!');
        else if (!enough && step === 2) set(1, 'Обучение · 2 из 3', 'Тяни назад, как рогатку. Пунктир — куда полетит сақа, дуга вокруг — сила броска.');
      },
      onCancel: function () {
        if (active) set(0, 'Обучение · 1 из 3', 'Слишком короткая оттяжка — бросок отменён и не сгорел. Нажми на сақа и потяни дальше.');
      },
      onThrow: function () {
        if (active) set(3, 'Отлично!', 'Асык, который остановился за белой линией круга, — 1 очко. Выбей все за 5 бросков.', 'Понятно');
      },
      onSettle: function (n) {
        if (!active || step !== 3) return;
        if (n > 0) textEl.textContent = 'Есть! +' + n + '. Продолжай — выбей все асыки за оставшиеся броски.';
        later(function () { if (active && step === 3) finishTutorial(); }, 3500);
      },
      reset: function () { Store.setTutorialDone(false); }
    };
  })();

  /* ---------- пауза ---------- */

  function pause(on) {
    if (game.state === 'over' && on) return;
    game.paused = on;
    $('modal-pause').hidden = !on;
    if (on && pointer) { pointer = null; game.aim = null; canvas.classList.remove('is-aiming'); }
  }

  function leaveGame() {
    clearTimers();
    game.state = 'idle';
    game.paused = false;
    $('modal-pause').hidden = true;
    Coach.stop();
    toastEl.hidden = true;
  }

  /* ---------- звук ---------- */

  function applySound() {
    var on = Store.get().sound;
    Sound.setEnabled(on);
    var b = $('btn-sound');
    b.classList.toggle('is-off', !on);
    b.setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
  }

  /* ---------- кнопки ---------- */

  var actions = {
    play: function () { openLevels('solo'); },
    duo: function () { openLevels('duo'); },
    rules: function () { show('rules'); },
    menu: function () { leaveGame(); show('menu'); },
    pause: function () { pause(true); },
    resume: function () { pause(false); },
    restart: function () { startLevel(game.levelIndex); },
    again: function () { startLevel(game.levelIndex); },
    next: function () { startLevel(Math.min(LEVELS.length - 1, game.levelIndex + 1)); },
    sound: function () { Sound.unlock(); Store.setSound(!Store.get().sound); applySound(); },
    'skip-tutorial': function () { Coach.skip(); },
    'replay-tutorial': function () { Coach.reset(); toastRules(); }
  };

  function toastRules() {
    var b = document.querySelector('[data-action="replay-tutorial"]');
    b.textContent = 'Обучение покажется в следующей игре ✓';
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (!t) return;
    var fn = actions[t.getAttribute('data-action')];
    if (fn) { Sound.unlock(); fn(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('screen-game').classList.contains('is-active')) pause(!game.paused);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && $('screen-game').classList.contains('is-active') && game.state === 'aim') pause(true);
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onPointerCancel);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  if (window.ResizeObserver) new ResizeObserver(function () { renderer.resize(); }).observe($('stage'));
  else window.addEventListener('resize', function () { renderer.resize(); });

  // шрифты на поле рисуются в canvas — перестроим фон, когда они загрузятся
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { renderer.board = null; });

  /* ---------- цикл ---------- */

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if ($('screen-game').classList.contains('is-active')) {
      update(dt);
      renderer.draw(game, now / 1000);
    }
    requestAnimationFrame(frame);
  }

  applySound();
  refreshMenu();
  requestAnimationFrame(frame);
})();
