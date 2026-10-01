/* Игровая логика, ввод, экраны, режимы, обучение и настройки. */
(function () {
  'use strict';

  var WORLD = window.AsykWorld;
  var LV = window.AsykLevels;
  var LEVELS = LV.list;
  var Store = window.AsykStorage;
  var Sound = window.AsykAudio;
  var Physics = window.AsykPhysics;
  var Ata = window.AsykAta;
  var Bot = window.AsykBot;
  var I18n = window.AsykI18n;
  var t = I18n.t;

  var MAX_MOVE_TIME = 12;   // страховка: бросок принудительно завершается
  var REPLAY_SPEED = 0.4;   // замедление повтора
  var PLAYER_COLORS = { p1: '#00a7c2', p2: '#e0524a' };
  var ACHIEVEMENTS = ['first', 'triple', 'clean', 'sniper', 'allLevels', 'master', 'botHard', 'daily', 'tradition', 'alshy'];
  // жеребьёвка: стороны асыка, вероятность выпадения и старшинство
  var TOSS_SIDES = [
    { id: 'alshy', name: 'алшы', p: 0.12, rank: 4 },
    { id: 'taiki', name: 'тәйкі', p: 0.12, rank: 3 },
    { id: 'buk', name: 'бүк', p: 0.38, rank: 2 },
    { id: 'shik', name: 'шік', p: 0.38, rank: 1 }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('board');
  var renderer = new window.AsykRenderer(canvas);

  /* ---------- состояние партии ---------- */

  var game = {
    mode: 'solo',       // solo | duo | bot | daily
    trad: false,
    botLevel: 'medium',
    level: null,
    levelIndex: 0,
    world: null,
    saka: null,
    sakaIndex: 0,
    asyks: [],
    stones: [],
    fading: [],
    popups: [],
    particles: [],
    trail: [],
    players: [],
    current: 0,
    state: 'idle',      // idle | toss | aim | moving | scoring | replay | over
    aim: null,
    paused: false,
    moveTime: 0,
    showGhost: false,
    shot: null,
    bonus: false,
    botThinking: false,
    botAnim: null,
    lastSnap: null,
    live: null,
    newAch: [],
    session: 0,
    labels: { launch: '', replay: '' },
    isOutside: function (a) {
      var r = this.level.rings[a.ring] || this.level.rings[0];
      return Math.hypot(a.x - r.x, a.y - r.y) > r.r;
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
      timers = timers.filter(function (x) { return x !== id; });
      fn();
    }, ms);
    timers.push(id);
    return id;
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function currentPlayer() { return game.players[game.current]; }
  function isActive(name) { return $('screen-' + name).classList.contains('is-active'); }

  function vibrate(pattern) {
    if (!Store.get().vibrate || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* не поддерживается */ }
  }
  var lastVibe = 0;

  /* ---------- экраны ---------- */

  function show(name) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('is-active', s.id === 'screen-' + name);
    });
    var app = $('app');
    if (name === 'game' && game.level) app.setAttribute('data-time', game.level.time);
    else app.removeAttribute('data-time');
    if (name === 'game') requestAnimationFrame(function () { renderer.resize(); });
    if (name === 'menu') refreshMenu();
  }

  function totalStars() {
    var st = Store.get(), s = 0;
    LEVELS.forEach(function (lv) { s += st.stars[lv.id] || 0; });
    return s;
  }

  function refreshMenu() {
    var st = Store.get();
    var done = LEVELS.filter(function (lv) { return st.completed[lv.id]; }).length;
    $('menu-progress').textContent = done
      ? t('menu.progress', { n: done, total: LEVELS.length, s: totalStars() + '/' + LEVELS.length * 3 })
      : t('menu.hint');
  }

  function levelTitle(lv) {
    if (lv.id === 'daily') return t('hud.daily', { date: lv.dateKey.split('-').reverse().slice(0, 2).join('.') });
    return t('hud.level', { n: lv.id, name: lv.name });
  }

  function starsText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += i < n ? '★' : '☆';
    return s;
  }

  function openLevels(mode) {
    game.mode = mode;
    var st = Store.get();
    $('levels-mode').textContent = t('mode.' + mode);
    $('bot-level-wrap').hidden = mode !== 'bot';
    $('trad-toggle').checked = st.trad;
    syncBotLevel();
    var list = $('level-list');
    list.replaceChildren();
    LEVELS.forEach(function (lv, idx) {
      var locked = mode === 'solo' && lv.id > st.unlocked;
      var btn = el('button', 'level-card');
      btn.type = 'button';
      btn.disabled = locked;
      btn.appendChild(el('span', 'level-num', locked ? '🔒' : String(lv.id)));
      var info = el('span');
      info.appendChild(el('span', 'level-name', lv.name + ' · ' + t('lvl.' + lv.key + '.sub')));
      info.appendChild(el('span', 'level-desc', t('lvl.' + lv.key + '.desc') + ' · ' + t('time.' + lv.time)));
      btn.appendChild(info);
      var total = lv.asyks.length;
      var right = el('span', 'level-best');
      if (locked) right.textContent = t('levels.locked', { n: lv.id - 1 });
      else if (mode === 'solo') {
        right.appendChild(el('span', 'level-stars' + (st.stars[lv.id] ? ' is-on' : ''), starsText(st.stars[lv.id] || 0)));
        if (st.best[lv.id] !== undefined) right.appendChild(el('span', 'level-rec', t('levels.best', { n: st.best[lv.id], total: total })));
        if (st.completed[lv.id]) right.classList.add('is-done');
      } else if (mode === 'duo' && st.duoBest[lv.id] !== undefined) {
        right.textContent = t('levels.best', { n: st.duoBest[lv.id], total: total });
      } else {
        right.textContent = t('levels.count', { n: total, asyks: I18n.asyks(total) });
      }
      btn.appendChild(right);
      btn.addEventListener('click', function () { startLevel(idx); });
      list.appendChild(btn);
    });
    show('levels');
  }

  function syncBotLevel() {
    var cur = Store.get().botLevel;
    document.querySelectorAll('[data-bot]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-bot') === cur ? 'true' : 'false');
    });
  }

  function renderAchievements() {
    var st = Store.get();
    var list = $('ach-list');
    list.replaceChildren();
    var n = 0;
    ACHIEVEMENTS.forEach(function (id) {
      var on = !!st.achievements[id];
      if (on) n++;
      var li = el('li', 'ach-item' + (on ? ' is-on' : ''));
      li.appendChild(el('span', 'ach-icon', on ? '🏆' : '🔒'));
      var txt = el('span', 'ach-text');
      txt.appendChild(el('b', null, t('ach.' + id + '.name')));
      txt.appendChild(el('span', null, t('ach.' + id + '.desc')));
      li.appendChild(txt);
      list.appendChild(li);
    });
    $('ach-count').textContent = t('ach.count', { n: n, total: ACHIEVEMENTS.length });
  }

  /* ---------- достижения ---------- */

  var achQueue = [], achBusy = false;
  function unlock(id) {
    if (!Store.unlockAchievement(id)) return;
    game.newAch.push(id);
    achQueue.push(t('ach.toast', { name: t('ach.' + id + '.name') }));
    vibrate([20, 30, 20]);
    pumpAch();
  }
  function pumpAch() {
    if (achBusy || !achQueue.length) return;
    achBusy = true;
    var box = $('ach-toast');
    $('ach-toast-text').textContent = achQueue.shift();
    box.hidden = false;
    setTimeout(function () { box.hidden = true; achBusy = false; setTimeout(pumpAch, 250); }, 2600);
  }

  /* ---------- запуск кона ---------- */

  function startLevel(idx, dailyLevel) {
    clearTimers();
    cancelBot();
    var lv = dailyLevel || LEVELS[idx];
    var st = Store.get();
    game.session++;
    game.levelIndex = dailyLevel ? -1 : idx;
    game.level = lv;
    game.trad = game.mode !== 'daily' && st.trad;
    game.botLevel = st.botLevel;
    game.world = new Physics.World({
      minX: WORLD.WALL, maxX: WORLD.W - WORLD.WALL,
      minY: WORLD.WALL, maxY: WORLD.H - WORLD.WALL
    });
    game.asyks = lv.asyks.map(function (p, i) {
      var spec = p.heavy ? WORLD.heavyAsyk : WORLD.asyk;
      return game.world.add(new Physics.Body({
        id: 'a' + i, kind: 'asyk', x: p.x, y: p.y, r: spec.r, m: spec.m,
        friction: lv.asykFriction, ring: p.ring || 0, heavy: !!p.heavy
      }));
    });
    game.stones = (lv.stones || []).map(function (s, i) {
      return game.world.add(new Physics.Body({ id: 's' + i, kind: 'stone', x: s.x, y: s.y, r: s.r, m: 1, friction: 0, isStatic: true }));
    });
    game.saka = game.world.add(new Physics.Body({
      id: 'saka', kind: 'saka', x: WORLD.W / 2, y: WORLD.launchY, r: WORLD.saka.r, m: WORLD.saka.m, friction: lv.sakaFriction
    }));
    game.sakaIndex = game.world.bodies.length - 1;
    game.fading = [];
    game.popups = [];
    game.particles = [];
    game.trail = [];
    game.newAch = [];
    game.lastSnap = null;
    game.live = null;
    if (game.mode === 'duo') game.players = [makePlayer('player.p1', 'p1'), makePlayer('player.p2', 'p2')];
    else if (game.mode === 'bot') game.players = [makePlayer('player.you', 'p1'), makePlayer('player.bot', 'p2', true)];
    else game.players = [makePlayer('player.you', 'p1')];
    game.current = 0;
    game.aim = null;
    menuPaused = false;
    $('modal-pause').hidden = true;
    $('replay-btn').hidden = true;
    $('toss').hidden = true;
    pointer = null;
    syncPause();
    Ata.resetTips();

    $('hud-level').textContent = levelTitle(lv);
    buildHud();
    show('game');

    if ((game.mode === 'solo' || game.mode === 'daily') && !st.tutorialDone) Coach.start();
    else Coach.stop();

    if (game.players.length > 1) startToss();
    else beginTurn(true);
  }

  function makePlayer(nameKey, color, bot) {
    return { nameKey: nameKey, color: color, bot: !!bot, score: 0, throwsLeft: WORLD.throwsPerRound, thrown: 0, misses: 0 };
  }
  function pname(p) { return t(p.nameKey); }

  function beginTurn(first) {
    var s = game.saka;
    s.x = WORLD.W / 2; s.y = WORLD.launchY;
    s.vx = s.vy = 0; s.angle = 0; s.spin = 0; s.active = true;
    game.state = 'aim';
    game.aim = null;
    game.trail = [];
    updateHud();
    if (game.players.length > 1) toast(t(first ? 'toast.starts' : 'toast.turn', { name: pname(currentPlayer()) }));
    if (currentPlayer().bot) botTurn();
  }

  /* ---------- жеребьёвка ---------- */

  var toss = null;

  function startToss() {
    game.state = 'toss';
    toss = { results: [], idx: 0, phase: 'throw', winner: 0 };
    var rows = $('toss-rows');
    rows.replaceChildren();
    toss.rows = game.players.map(function (p) {
      var row = el('div', 'toss-row');
      row.style.setProperty('--pc', PLAYER_COLORS[p.color]);
      row.appendChild(el('span', 'toss-name', pname(p)));
      var bone = el('span', 'toss-asyk');
      row.appendChild(bone);
      var res = el('span', 'toss-result', '—');
      row.appendChild(res);
      rows.appendChild(row);
      return { bone: bone, res: res };
    });
    $('toss').hidden = false;
    tossStep();
  }

  function tossStep() {
    var btn = $('toss-btn');
    var hint = $('toss-hint');
    if (toss.idx < game.players.length) {
      var p = game.players[toss.idx];
      toss.phase = 'throw';
      hint.textContent = t('toss.hint');
      btn.textContent = t('toss.throw', { name: pname(p) });
      btn.disabled = p.bot;
      if (p.bot) later(doToss, 700);
      else btn.focus();
      return;
    }
    var a = toss.results[0].rank, b = toss.results[1].rank;
    btn.disabled = false;
    if (a === b) {
      toss.phase = 'tie';
      hint.textContent = t('toss.tie');
      btn.textContent = t('toss.again');
    } else {
      toss.phase = 'done';
      toss.winner = a > b ? 0 : 1;
      hint.textContent = t('toss.first', { name: pname(game.players[toss.winner]) });
      btn.textContent = t('toss.start');
    }
    btn.focus();
  }

  function rollSide() {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < TOSS_SIDES.length; i++) {
      acc += TOSS_SIDES[i].p;
      if (r < acc) return TOSS_SIDES[i];
    }
    return TOSS_SIDES[TOSS_SIDES.length - 1];
  }

  function doToss() {
    if (!toss || toss.phase !== 'throw') return;
    var i = toss.idx;
    var row = toss.rows[i];
    var side = rollSide();
    toss.phase = 'rolling';
    $('toss-btn').disabled = true;
    row.bone.className = 'toss-asyk is-spinning';
    row.res.textContent = '…';
    Sound.hit(0.4);
    later(function () {
      row.bone.className = 'toss-asyk side-' + side.id;
      row.res.textContent = side.name;
      Sound.hit(0.7);
      vibrate(15);
      toss.results[i] = side;
      if (side.id === 'alshy' && !game.players[i].bot) unlock('alshy');
      toss.idx++;
      tossStep();
    }, 900);
  }

  $('toss-btn').addEventListener('click', function () {
    if (!toss) return;
    Sound.unlock();
    if (toss.phase === 'throw') doToss();
    else if (toss.phase === 'tie') {
      toss.results = [];
      toss.idx = 0;
      toss.rows.forEach(function (r) { r.bone.className = 'toss-asyk'; r.res.textContent = '—'; });
      tossStep();
    } else if (toss.phase === 'done') {
      $('toss').hidden = true;
      game.current = toss.winner;
      toss = null;
      beginTurn(true);
    }
  });

  /* ---------- HUD ---------- */

  function buildHud() {
    var wrap = $('hud-players');
    wrap.replaceChildren();
    game.players.forEach(function (p) {
      var card = el('div', 'player-card');
      card.style.setProperty('--pc', PLAYER_COLORS[p.color]);
      card.appendChild(el('span', 'player-name', pname(p)));
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
    if (!game.players.length || !game.players[0].ui) return;
    var total = game.asyks.length;
    game.players.forEach(function (p, i) {
      var active = i === game.current && game.state !== 'over' && game.state !== 'toss';
      p.ui.card.classList.toggle('is-active', active);
      p.ui.card.classList.toggle('is-waiting', game.players.length > 1 && !active);
      p.ui.score.replaceChildren(document.createTextNode(String(p.score)));
      if (game.players.length === 1) p.ui.score.appendChild(el('small', null, '/' + total));
      var used = WORLD.throwsPerRound - p.throwsLeft;
      Array.prototype.forEach.call(p.ui.dots.children, function (d, k) { d.classList.toggle('is-used', k < used); });
    });
    var p = currentPlayer();
    var turn = $('hud-turn');
    turn.style.setProperty('--pc', PLAYER_COLORS[p.color]);
    if (game.state === 'toss') { turn.textContent = t('toss.title'); return; }
    var throwNo = Math.min(WORLD.throwsPerRound, WORLD.throwsPerRound - p.throwsLeft + (game.state === 'aim' ? 1 : 0));
    var who = game.players.length > 1 ? t('hud.turnOf', { name: pname(p) }) : t('hud.yourTurn');
    turn.textContent = who + ' · ' + (game.botThinking ? t('hud.thinking') : t('hud.throw', { n: Math.max(1, throwNo), total: WORLD.throwsPerRound }));
  }

  var toastEl = $('toast');
  var toastTimer = null;
  function toast(text) {
    toastEl.hidden = true;
    void toastEl.offsetWidth; // перезапуск CSS-анимации
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 1400);
  }

  /* ---------- ввод: рогатка ---------- */

  function grabRadius() { return Store.get().bigUi ? 140 : 110; }

  function onPointerDown(e) {
    if (game.state === 'replay') { endReplay(); return; }
    if (game.state !== 'aim' || game.paused || pointer || currentPlayer().bot) return;
    Sound.unlock();
    var p = renderer.toWorld(e.clientX, e.clientY);
    var s = game.saka;
    var d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d > grabRadius()) {
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
    var pull = Math.min(WORLD.maxPull, len);
    if (len > 0.5) { game.aim.dirX = dx / len; game.aim.dirY = dy / len; }
    game.aim.pull = pull;
    game.aim.power = pull / WORLD.maxPull;
    Coach.onAim(game.aim.power, pull >= WORLD.minPull);
  }

  function onPointerUp(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    pointer = null;
    canvas.classList.remove('is-aiming');
    var aim = game.aim;
    game.aim = null;
    if (!aim || game.state !== 'aim') return;
    if (aim.pull < WORLD.minPull) { Coach.onCancel(); return; }
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
    var speed = aim.power * WORLD.maxSpeed;
    s.vx = aim.dirX * speed;
    s.vy = aim.dirY * speed;
    s.spin = aim.dirX * 3; // лёгкая закрутка при косом броске — только визуально
    game.shot = aimInfo(s, aim);
    game.lastSnap = game.world.clone(); // снимок для повтора — физика детерминирована
    var p = currentPlayer();
    p.throwsLeft--;
    p.thrown++;
    game.state = 'moving';
    game.moveTime = 0;
    game.trail = [];
    Sound.throwSound(aim.power);
    Ata.hideTip();
    updateHud();
    if (!p.bot) Coach.onThrow();
  }

  /* Что было перед броском: куда смотрел прицел относительно асыков.
     Нужно помощнику Ата, чтобы разобрать бросок. */
  function aimInfo(s, aim) {
    var best = null;
    game.asyks.forEach(function (a) {
      if (!a.active) return;
      var rx = a.x - s.x, ry = a.y - s.y;
      var along = rx * aim.dirX + ry * aim.dirY;
      if (along <= 0) return;
      var cross = aim.dirX * ry - aim.dirY * rx; // > 0 — асык правее линии прицела
      if (!best || Math.abs(cross) < Math.abs(best.cross)) best = { cross: cross, along: along };
    });
    return {
      power: aim.power,
      dirX: aim.dirX,
      dirY: aim.dirY,
      startX: s.x,
      startY: s.y,
      noTarget: !best,
      missSide: best && Math.abs(best.cross) > WORLD.saka.r + WORLD.asyk.r ? (best.cross > 0 ? 'left' : 'right') : null,
      targetAlong: best ? best.along : 0,
      sakaHit: false,
      hitStone: false,
      firstCos: 1
    };
  }

  /* ---------- компьютер ---------- */

  var botCancel = null;

  function botTurn() {
    game.botThinking = true;
    updateHud();
    var session = game.session;
    later(function () {
      if (session !== game.session || game.state !== 'aim') return;
      botCancel = Bot.plan({
        world: game.world, sakaIndex: game.sakaIndex, rings: game.level.rings, trad: game.trad
      }, game.botLevel, function (shot) {
        botCancel = null;
        if (session !== game.session || game.state !== 'aim') return;
        game.botThinking = false;
        game.botAnim = { shot: shot, t: 0, fromX: game.saka.x };
        updateHud();
      });
    }, 450);
  }

  function cancelBot() {
    if (botCancel) botCancel();
    botCancel = null;
    game.botAnim = null;
    game.botThinking = false;
  }

  /* Компьютер «переставляет» сақа, плавно натягивает рогатку и отпускает. */
  function updateBotAnim(dt) {
    var a = game.botAnim;
    a.t += dt;
    var s = game.saka, sh = a.shot;
    var e1 = Math.min(1, a.t / 0.45);
    s.x = a.fromX + (sh.x - a.fromX) * (1 - Math.pow(1 - e1, 3));
    if (a.t > 0.45) {
      var e2 = Math.min(1, (a.t - 0.45) / 0.8);
      e2 = 1 - Math.pow(1 - e2, 2);
      game.aim = { dirX: sh.dirX, dirY: sh.dirY, power: sh.power * e2, pull: sh.power * WORLD.maxPull * e2 };
    }
    if (a.t > 1.5) {
      game.botAnim = null;
      game.aim = null;
      throwSaka({ dirX: sh.dirX, dirY: sh.dirY, power: sh.power, pull: sh.power * WORLD.maxPull });
    }
  }

  /* ---------- ход симуляции ---------- */

  function spawnDust(x, y, strength, color) {
    var n = Math.round(3 + strength * 12);
    for (var i = 0; i < n && game.particles.length < 180; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * (80 + strength * 420);
      game.particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: 2.5 + Math.random() * 4.5, t: 0, dur: 0.45 + Math.random() * 0.5,
        color: color, alpha: 0.55 + strength * 0.3
      });
    }
  }

  function update(dt) {
    if (game.paused) return;

    if (game.botAnim && game.state === 'aim') updateBotAnim(dt);

    if (game.state === 'moving' || game.state === 'replay') {
      var replay = game.state === 'replay';
      var k = replay ? REPLAY_SPEED : 1;
      game.moveTime += dt * k;
      var events = game.world.step(dt * k);
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (ev.type === 'hit') {
          Sound.hit(ev.strength);
          var stone = ev.a.kind === 'stone' || ev.b.kind === 'stone';
          spawnDust((ev.a.x + ev.b.x) / 2, (ev.a.y + ev.b.y) / 2, ev.strength, stone ? '170, 165, 155' : '120, 88, 52');
          if (!replay) {
            var now = performance.now();
            if (ev.strength > 0.3 && now - lastVibe > 90) { vibrate(12); lastVibe = now; }
            var withSaka = ev.a === game.saka || ev.b === game.saka;
            if (game.shot && withSaka && !game.shot.sakaHit) {
              if (stone) game.shot.hitStone = true;
              else { game.shot.sakaHit = true; game.shot.firstCos = ev.cos; }
            }
          }
        } else if (ev.type === 'wall') {
          Sound.wall(ev.strength);
          spawnDust(ev.b.x, ev.b.y, ev.strength * 0.6, '120, 88, 52');
        }
      }
      var s = game.saka;
      if (s.speed() > 40) {
        game.trail.push({ x: s.x, y: s.y });
        if (game.trail.length > 16) game.trail.shift();
      } else if (game.trail.length) game.trail.shift();

      if ((game.moveTime > 0.25 && game.world.isSettled()) || game.moveTime > MAX_MOVE_TIME) {
        game.world.freeze();
        if (replay) endReplay(); else resolveThrow();
      }
    } else if (game.trail.length) game.trail.shift();

    game.particles = game.particles.filter(function (d) {
      d.t += dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.vx *= 1 - 4 * dt; d.vy *= 1 - 4 * dt;
      return d.t < d.dur;
    });
    game.fading = game.fading.filter(function (f) { f.t += dt; return f.t < f.dur; });
    game.popups = game.popups.filter(function (p) { p.t += dt; return p.t < p.dur; });
  }

  function sakaInRing() {
    var s = game.saka;
    return game.level.rings.some(function (r) { return Math.hypot(s.x - r.x, s.y - r.y) <= r.r; });
  }

  function resolveThrow() {
    game.state = 'scoring';
    var knocked = game.asyks.filter(function (a) { return a.active && game.isOutside(a); });
    var player = currentPlayer();
    knocked.forEach(function (a, i) {
      a.active = false; // выбитый асык больше не участвует и не будет посчитан снова
      game.fading.push({ x: a.x, y: a.y, r: a.r, angle: a.angle, heavy: a.heavy, tx: WORLD.W / 2 + (a.x - WORLD.W / 2) * 0.3, ty: -60, t: -i * 0.12, dur: 0.9 + i * 0.12 });
      game.popups.push({ text: '+1', x: a.x, y: a.y - 30, t: 0, dur: 1.1 });
    });
    var n = knocked.length;
    player.score += n;
    if (n) { Sound.score(); vibrate([25, 40, 25]); } else player.misses++;
    var remaining = game.asyks.filter(function (a) { return a.active; }).length;

    // традиционные правила: выбил — ещё бросок; сақа осталась в коне впустую — штраф
    game.bonus = false;
    if (game.trad) {
      if (n === 0 && sakaInRing()) {
        if (player.throwsLeft > 0) { player.throwsLeft--; toast(t('toast.penalty')); }
      } else if (n > 0 && remaining > 0) {
        player.throwsLeft++;
        game.bonus = true;
        toast(t('toast.bonus'));
      }
    }

    if (!player.bot) {
      if (n >= 1) unlock('first');
      if (n >= 3) unlock('triple');
    }
    updateHud();

    Coach.onSettle(n);
    adviseAfterThrow(n, remaining);

    if (n >= 2 && game.lastSnap) {
      $('replay-btn').hidden = false;
      later(nextTurn, 2600);
    } else {
      game.lastSnap = null;
      later(nextTurn, n ? 900 : 450);
    }
  }

  function adviseAfterThrow(knocked, remaining) {
    var shot = game.shot;
    game.shot = null;
    if (!shot || Coach.isActive() || currentPlayer().bot) return;
    var s = game.saka;
    var left = game.asyks.filter(function (a) { return a.active; });
    var traveled = (s.x - shot.startX) * shot.dirX + (s.y - shot.startY) * shot.dirY;
    shot.fellShort = !shot.sakaHit && !shot.noTarget && traveled < shot.targetAlong - WORLD.asyk.r;
    shot.knocked = knocked;
    shot.remaining = remaining;
    shot.nearEdge = left.filter(function (a) {
      var r = game.level.rings[a.ring] || game.level.rings[0];
      return Math.hypot(a.x - r.x, a.y - r.y) > r.r - 45;
    }).length;
    shot.throwsLeft = currentPlayer().throwsLeft;
    shot.final = remaining === 0 || !game.players.some(function (p) { return p.throwsLeft > 0; });
    Ata.afterThrow(shot);
  }

  function nextTurn() {
    if (game.state !== 'scoring') return;
    $('replay-btn').hidden = true;
    game.lastSnap = null;
    var remaining = game.asyks.filter(function (a) { return a.active; }).length;
    var anyThrows = game.players.some(function (p) { return p.throwsLeft > 0; });
    if (remaining === 0 || !anyThrows) { finish(); return; }

    if (game.players.length > 1 && !game.bonus) {
      var next = (game.current + 1) % game.players.length;
      if (game.players[next].throwsLeft > 0) game.current = next;
    }
    beginTurn(false);
  }

  /* ---------- повтор ---------- */

  function startReplay() {
    if (game.state !== 'scoring' || !game.lastSnap) return;
    $('replay-btn').hidden = true;
    Ata.hideTip();
    game.live = { world: game.world, saka: game.saka, asyks: game.asyks, stones: game.stones };
    var w = game.lastSnap;
    game.lastSnap = null;
    game.world = w;
    game.saka = w.bodies[game.sakaIndex];
    game.asyks = w.bodies.filter(function (b) { return b.kind === 'asyk'; });
    game.stones = w.bodies.filter(function (b) { return b.kind === 'stone'; });
    game.state = 'replay';
    game.moveTime = 0;
    game.trail = [];
  }

  function endReplay() {
    if (game.state !== 'replay' || !game.live) return;
    game.world = game.live.world;
    game.saka = game.live.saka;
    game.asyks = game.live.asyks;
    game.stones = game.live.stones;
    game.live = null;
    game.trail = [];
    game.state = 'scoring';
    nextTurn();
  }

  $('replay-btn').addEventListener('click', startReplay);

  /* ---------- итог ---------- */

  function finish() {
    game.state = 'over';
    game.saka.active = false;
    cancelBot();
    updateHud();
    var lv = game.level;
    var total = game.asyks.length;
    var title = $('result-title');
    var table = $('result-table');
    table.replaceChildren();
    $('result-kicker').textContent = levelTitle(lv) + (game.trad ? ' · ' + t('result.trad') : '');
    $('result-stars').hidden = true;
    $('result-stars-hint').hidden = true;
    $('btn-next').hidden = true;
    var st = Store.get();
    var won = false;

    if (game.mode === 'solo' || game.mode === 'daily') {
      var p0 = game.players[0];
      var score = p0.score;
      won = score === total;
      title.textContent = won ? t('result.win') : t('result.lose');
      title.classList.toggle('is-lose', !won);
      setScoreLine(t('result.knockedBefore'), score, t('result.knockedAfter', { total: total }));
      if (won && p0.misses === 0) unlock('clean');
      if (won && game.trad) unlock('tradition');

      if (game.mode === 'daily') {
        var rec = Store.submitDaily(lv.dateKey, score, won);
        if (won) unlock('daily');
        $('result-best').textContent = t('result.dailyBest', { n: Store.get().daily.best, total: total }) + (rec && score > 0 ? t('result.newRecord') : '');
      } else {
        if (won) Store.completeLevel(lv.id);
        if (!game.trad) {
          var record = Store.submitScore(lv.id, score, false);
          var stars = won ? (p0.thrown <= 3 ? 3 : p0.thrown <= 4 ? 2 : 1) : 0;
          Store.submitStars(lv.id, stars);
          showStars(stars);
          if (stars === 3) unlock('sniper');
          $('result-best').textContent = t('result.best', { n: st.best[lv.id], total: total }) + (record && score > 0 ? t('result.newRecord') : '');
        } else {
          $('result-best').textContent = '';
        }
        if (LEVELS.every(function (l) { return st.completed[l.id]; })) unlock('allLevels');
        if (LEVELS.every(function (l) { return st.stars[l.id] === 3; })) unlock('master');
        $('btn-next').hidden = !(won && game.levelIndex < LEVELS.length - 1);
      }
      if (won) Sound.win(); else Sound.lose();
    } else {
      var a = game.players[0], b = game.players[1];
      var top = Math.max(a.score, b.score);
      var draw = a.score === b.score;
      if (game.mode === 'bot') {
        won = a.score > b.score;
        title.textContent = draw ? t('result.draw') : won ? t('result.youWin') : t('result.botWin');
        if (won && game.botLevel === 'hard') unlock('botHard');
        if (won && game.trad) unlock('tradition');
        $('result-best').textContent = t('result.botLevel', { level: t('bot.' + game.botLevel) });
        if (won) Sound.win(); else Sound.lose();
      } else {
        title.textContent = draw ? t('result.draw') : t('result.winner', { name: pname(a.score > b.score ? a : b) });
        if (!game.trad) {
          var rec2 = Store.submitScore(lv.id, top, true);
          $('result-best').textContent = t('result.duoBest', { n: Store.get().duoBest[lv.id], total: total }) + (rec2 && top > 0 ? t('result.newRecord') : '');
        } else $('result-best').textContent = '';
        Sound.win();
      }
      title.classList.toggle('is-lose', draw || (game.mode === 'bot' && !won));
      setScoreLine(t('result.knockedTotal'), a.score + b.score, t('result.knockedAfter', { total: total }));
      game.players.forEach(function (p) {
        var row = el('div', 'result-row' + (!draw && p.score === top ? ' is-winner' : ''));
        row.style.setProperty('--pc', PLAYER_COLORS[p.color]);
        row.appendChild(el('span', null, pname(p)));
        row.appendChild(el('b', null, String(p.score)));
        table.appendChild(row);
      });
      $('btn-next').hidden = game.levelIndex >= LEVELS.length - 1;
    }

    var achBox = $('result-ach');
    var achList = $('result-ach-list');
    achList.replaceChildren();
    game.newAch.forEach(function (id) { achList.appendChild(el('li', null, '🏆 ' + t('ach.' + id + '.name'))); });
    achBox.hidden = !game.newAch.length;

    later(function () { show('result'); }, 800);
  }

  function showStars(n) {
    var box = $('result-stars');
    box.hidden = false;
    $('result-stars-hint').hidden = false;
    box.setAttribute('aria-label', t('result.stars', { n: n }));
    Array.prototype.forEach.call(box.children, function (s, i) { s.classList.toggle('is-on', i < n); });
  }

  function setScoreLine(before, num, after) {
    var line = $('result-score');
    line.replaceChildren(document.createTextNode(before), el('b', null, String(num)), document.createTextNode(after));
  }

  /* ---------- обучение для новичка ---------- */

  var Coach = (function () {
    var box = $('coach'), stepEl = $('coach-step'), textEl = $('coach-text'), skip = $('coach-skip');
    var active = false, step = 0, current = null;

    function set(n, head, text, btn, vars) {
      step = n;
      current = { head: head, text: text, btn: btn, vars: vars };
      render();
      game.showGhost = active && n === 0;
    }
    function render() {
      if (!current) return;
      stepEl.textContent = t(current.head);
      textEl.textContent = t(current.text, current.vars);
      skip.textContent = t(current.btn || 'coach.skip');
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
        set(0, 'coach.step1Head', 'coach.step1');
      },
      stop: function () { active = false; box.hidden = true; game.showGhost = false; },
      skip: finishTutorial,
      refresh: render,
      onGrab: function () {
        if (active && step <= 1) set(1, 'coach.step2Head', 'coach.step2');
      },
      onAim: function (power, enough) {
        if (!active) return;
        if (enough && power > 0.2 && step === 1) set(2, 'coach.step3Head', 'coach.step3');
        else if (!enough && step === 2) set(1, 'coach.step2Head', 'coach.step2');
      },
      onCancel: function () {
        if (active) set(0, 'coach.step1Head', 'coach.cancel');
      },
      onThrow: function () {
        if (active) set(3, 'coach.doneHead', 'coach.done', 'coach.gotIt');
      },
      onSettle: function (n) {
        if (!active || step !== 3) return;
        if (n > 0) set(3, 'coach.doneHead', 'coach.settle', 'coach.gotIt', { n: n });
        later(function () { if (active && step === 3) finishTutorial(); }, 3500);
      },
      reset: function () { Store.setTutorialDone(false); },
      isActive: function () { return active; }
    };
  })();

  /* ---------- пауза и диалоги ---------- */

  var menuPaused = false;      // открыто меню паузы
  var guidePaused = false;     // открыт справочник Ата
  var settingsPaused = false;  // открыты настройки

  function syncPause() {
    game.paused = menuPaused || guidePaused || settingsPaused;
    if (game.paused && pointer) { pointer = null; game.aim = null; canvas.classList.remove('is-aiming'); }
  }

  function pause(on) {
    if (on && (game.state === 'over' || game.state === 'toss')) return;
    menuPaused = on;
    $('modal-pause').hidden = !on;
    syncPause();
  }

  Ata.init({
    onOpen: function () { guidePaused = true; syncPause(); },
    onClose: function () { guidePaused = false; syncPause(); }
  });

  function leaveGame() {
    clearTimers();
    cancelBot();
    game.session++;
    game.state = 'idle';
    menuPaused = false;
    $('modal-pause').hidden = true;
    $('toss').hidden = true;
    $('replay-btn').hidden = true;
    toss = null;
    syncPause();
    Ata.hideTip();
    Coach.stop();
    toastEl.hidden = true;
  }

  /* ---------- настройки ---------- */

  var settingsEl = $('settings');
  var installPrompt = null;

  function openSettings() {
    syncSettingsUi();
    settingsEl.hidden = false;
    settingsPaused = true;
    syncPause();
    $('settings-close').focus();
  }

  function closeSettings() {
    if (settingsEl.hidden) return;
    settingsEl.hidden = true;
    settingsPaused = false;
    syncPause();
  }

  function syncSettingsUi() {
    var st = Store.get();
    settingsEl.querySelectorAll('[data-flag]').forEach(function (inp) { inp.checked = !!st[inp.getAttribute('data-flag')]; });
    settingsEl.querySelectorAll('[data-lang-set]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-lang-set') === st.lang ? 'true' : 'false');
    });
    $('install-btn').hidden = !installPrompt;
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
    $('install-note').textContent = ios ? t('settings.installIos') : ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) ? t('settings.installed') : '');
  }

  settingsEl.querySelectorAll('[data-flag]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      Store.setFlag(inp.getAttribute('data-flag'), inp.checked);
      applySettings();
      if (inp.getAttribute('data-flag') === 'vibrate' && inp.checked) vibrate(30);
    });
  });
  settingsEl.querySelectorAll('[data-lang-set]').forEach(function (b) {
    b.addEventListener('click', function () {
      Store.setLang(b.getAttribute('data-lang-set'));
      applySettings();
      syncSettingsUi();
    });
  });
  $('settings-close').addEventListener('click', closeSettings);
  settingsEl.addEventListener('click', function (e) { if (e.target === settingsEl) closeSettings(); });
  settingsEl.addEventListener('keydown', function (e) { trapFocus(settingsEl, e); });

  $('install-btn').addEventListener('click', function () {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt = null;
    $('install-btn').hidden = true;
  });
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installPrompt = e;
    if (!settingsEl.hidden) syncSettingsUi();
  });

  function trapFocus(box, e) {
    if (e.key !== 'Tab') return;
    var items = Array.prototype.filter.call(box.querySelectorAll('button, input'), function (x) {
      return !x.disabled && x.offsetParent !== null;
    });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function applySettings() {
    var st = Store.get();
    I18n.setLang(st.lang);
    Sound.setEnabled(st.sound);
    var root = document.documentElement;
    root.classList.toggle('is-left', st.leftHand);
    root.classList.toggle('is-large', st.bigUi);
    var b = $('btn-sound');
    b.classList.toggle('is-off', !st.sound);
    game.labels = { launch: t('launch.label'), replay: t('replay.banner') };
    if (game.level && game.players.length) {
      $('hud-level').textContent = levelTitle(game.level);
      buildHud();
      updateHud();
    }
    Coach.refresh();
    if (isActive('levels')) openLevels(game.mode);
    if (isActive('ach')) renderAchievements();
    refreshMenu();
    requestAnimationFrame(function () { renderer.resize(); });
  }

  /* ---------- кнопки ---------- */

  var actions = {
    play: function () { openLevels('solo'); },
    duo: function () { openLevels('duo'); },
    bot: function () { openLevels('bot'); },
    daily: function () { game.mode = 'daily'; startLevel(-1, LV.daily()); },
    rules: function () { show('rules'); },
    achievements: function () { renderAchievements(); show('ach'); },
    settings: openSettings,
    menu: function () { leaveGame(); show('menu'); },
    pause: function () { pause(true); },
    resume: function () { pause(false); },
    restart: restartLevel,
    again: restartLevel,
    next: function () { startLevel(Math.min(LEVELS.length - 1, game.levelIndex + 1)); },
    sound: function () { Sound.unlock(); Store.setFlag('sound', !Store.get().sound); applySettings(); },
    'skip-tutorial': function () { Coach.skip(); },
    'replay-tutorial': function (btn) { Coach.reset(); btn.textContent = t('rules.replayDone'); }
  };

  function restartLevel() {
    if (game.mode === 'daily') startLevel(-1, LV.daily());
    else startLevel(game.levelIndex);
  }

  document.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var fn = actions[target.getAttribute('data-action')];
    if (fn) { Sound.unlock(); fn(target); }
  });

  $('trad-toggle').addEventListener('change', function () { Store.setFlag('trad', $('trad-toggle').checked); });
  document.querySelectorAll('[data-bot]').forEach(function (b) {
    b.addEventListener('click', function () { Store.setBotLevel(b.getAttribute('data-bot')); syncBotLevel(); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!settingsEl.hidden) { closeSettings(); return; }
    if (Ata.isOpen()) { Ata.close(); return; }
    if (isActive('game')) {
      if (game.state === 'replay') endReplay();
      else pause(!menuPaused);
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && isActive('game') && (game.state === 'aim' || game.state === 'moving')) pause(true);
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

  // офлайн-режим и установка на телефон (только по http/https, не из файла)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* без офлайна — не страшно */ });
    });
  }

  /* ---------- цикл ---------- */

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (isActive('game')) {
      update(dt);
      renderer.draw(game, now / 1000);
    }
    requestAnimationFrame(frame);
  }

  applySettings();
  requestAnimationFrame(frame);
})();
