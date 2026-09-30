/* Сохранение прогресса и рекордов в localStorage.
   Данные из хранилища считаются недоверенными: всё проверяется
   и приводится к ожидаемым типам, мусор отбрасывается. */
(function () {
  'use strict';

  var KEY = 'asyk-atu:v1';
  var LEVEL_COUNT = 3;
  var MAX_SCORE = 99;

  function defaults() {
    return { tutorialDone: false, unlocked: 1, sound: true, best: {}, duoBest: {}, completed: {} };
  }

  function toInt(value, min, max, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    n = Math.floor(n);
    return n < min || n > max ? fallback : n;
  }

  function cleanScores(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (var i = 1; i <= LEVEL_COUNT; i++) {
      var v = toInt(obj[i], 0, MAX_SCORE, null);
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

  function read() {
    var d = defaults();
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { return d; }
    if (!raw) return d;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return d; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return d;
    return {
      tutorialDone: parsed.tutorialDone === true,
      unlocked: toInt(parsed.unlocked, 1, LEVEL_COUNT, 1),
      sound: parsed.sound !== false,
      best: cleanScores(parsed.best),
      duoBest: cleanScores(parsed.duoBest),
      completed: cleanFlags(parsed.completed)
    };
  }

  var state = read();

  function write() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* приватный режим — играем без сохранения */ }
  }

  window.AsykStorage = {
    get: function () { return state; },

    setTutorialDone: function (done) { state.tutorialDone = !!done; write(); },

    setSound: function (on) { state.sound = !!on; write(); },

    /* Возвращает true, если это новый рекорд. */
    submitScore: function (level, score, duo) {
      var table = duo ? state.duoBest : state.best;
      var prev = table[level];
      var isRecord = prev === undefined || score > prev;
      if (isRecord) table[level] = score;
      write();
      return isRecord;
    },

    completeLevel: function (level) {
      state.completed[level] = true;
      if (level + 1 > state.unlocked && level + 1 <= LEVEL_COUNT) state.unlocked = level + 1;
      write();
    }
  };
})();
