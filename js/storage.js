/* Сохранение прогресса, рекордов и настроек в localStorage.
   Данные из хранилища считаются недоверенными: всё проверяется
   и приводится к ожидаемым типам, мусор отбрасывается. */
(function () {
  'use strict';

  var KEY = 'asyk-atu:v1';
  var LEVEL_COUNT = window.AsykLevels.list.length;
  var MAX_SCORE = 99;
  var LANGS = ['ru', 'kk'];
  var BOT_LEVELS = ['easy', 'medium', 'hard'];
  var FLAGS = ['sound', 'hints', 'vibrate', 'leftHand', 'bigUi', 'trad'];
  var FLAG_DEFAULTS = { sound: true, hints: true, vibrate: true, leftHand: false, bigUi: false, trad: false };

  function defaults() {
    var d = {
      tutorialDone: false, unlocked: 1, lang: 'ru', botLevel: 'medium',
      best: {}, duoBest: {}, completed: {}, stars: {}, achievements: {},
      daily: { date: '', best: 0, won: false }
    };
    FLAGS.forEach(function (f) { d[f] = FLAG_DEFAULTS[f]; });
    return d;
  }

  function toInt(value, min, max, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    n = Math.floor(n);
    return n < min || n > max ? fallback : n;
  }

  function cleanNumbers(obj, max) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (var i = 1; i <= LEVEL_COUNT; i++) {
      var v = toInt(obj[i], 0, max, null);
      if (v !== null) out[i] = v;
    }
    return out;
  }

  function cleanFlags(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (var i = 1; i <= LEVEL_COUNT; i++) if (obj[i] === true) out[i] = true;
    return out;
  }

  function cleanAchievements(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(function (k) {
      if (/^[a-zA-Z]{2,20}$/.test(k) && obj[k] === true) out[k] = true;
    });
    return out;
  }

  function cleanDaily(obj) {
    if (!obj || typeof obj !== 'object' || typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) {
      return { date: '', best: 0, won: false };
    }
    return { date: obj.date, best: toInt(obj.best, 0, MAX_SCORE, 0), won: obj.won === true };
  }

  function read() {
    var d = defaults();
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { return d; }
    if (!raw) return d;
    var p;
    try { p = JSON.parse(raw); } catch (e) { return d; }
    if (!p || typeof p !== 'object' || Array.isArray(p)) return d;
    var st = {
      tutorialDone: p.tutorialDone === true,
      unlocked: toInt(p.unlocked, 1, LEVEL_COUNT, 1),
      lang: LANGS.indexOf(p.lang) >= 0 ? p.lang : 'ru',
      botLevel: BOT_LEVELS.indexOf(p.botLevel) >= 0 ? p.botLevel : 'medium',
      best: cleanNumbers(p.best, MAX_SCORE),
      duoBest: cleanNumbers(p.duoBest, MAX_SCORE),
      completed: cleanFlags(p.completed),
      stars: cleanNumbers(p.stars, 3),
      achievements: cleanAchievements(p.achievements),
      daily: cleanDaily(p.daily)
    };
    FLAGS.forEach(function (f) {
      st[f] = typeof p[f] === 'boolean' ? p[f] : FLAG_DEFAULTS[f];
    });
    return st;
  }

  var state = read();

  function write() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* приватный режим — играем без сохранения */ }
  }

  window.AsykStorage = {
    get: function () { return state; },

    setTutorialDone: function (done) { state.tutorialDone = !!done; write(); },

    /* Булевы настройки: sound, hints, vibrate, leftHand, bigUi, trad. */
    setFlag: function (name, on) {
      if (FLAGS.indexOf(name) < 0) return;
      state[name] = !!on;
      write();
    },

    setLang: function (lang) { if (LANGS.indexOf(lang) >= 0) { state.lang = lang; write(); } },

    setBotLevel: function (lvl) { if (BOT_LEVELS.indexOf(lvl) >= 0) { state.botLevel = lvl; write(); } },

    /* Возвращает true, если это новый рекорд. */
    submitScore: function (level, score, duo) {
      var table = duo ? state.duoBest : state.best;
      var prev = table[level];
      var isRecord = prev === undefined || score > prev;
      if (isRecord) table[level] = score;
      write();
      return isRecord;
    },

    /* Возвращает true, если звёзд стало больше. */
    submitStars: function (level, stars) {
      var prev = state.stars[level] || 0;
      if (stars <= prev) return false;
      state.stars[level] = stars;
      write();
      return true;
    },

    completeLevel: function (level) {
      state.completed[level] = true;
      if (level + 1 > state.unlocked && level + 1 <= LEVEL_COUNT) state.unlocked = level + 1;
      write();
    },

    /* Возвращает true, если достижение открыто впервые. */
    unlockAchievement: function (id) {
      if (!/^[a-zA-Z]{2,20}$/.test(id) || state.achievements[id]) return false;
      state.achievements[id] = true;
      write();
      return true;
    },

    /* Результат «Кона дня». Возвращает true, если это рекорд дня. */
    submitDaily: function (date, score, won) {
      var d = state.daily;
      if (d.date !== date) d = state.daily = { date: date, best: 0, won: false };
      var record = score > d.best;
      if (record) d.best = score;
      if (won) d.won = true;
      write();
      return record;
    }
  };
})();
