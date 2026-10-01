/* Помощник «Ата»: справочник с вкладками и короткие подсказки после броска.
   Подсказки — это набор правил в коде (не ИИ): смотрим на силу, угол,
   попадание и результат броска и выбираем подходящую фразу. */
(function () {
  'use strict';

  var Store = window.AsykStorage;
  var I18n = window.AsykI18n;
  var t = I18n.t;
  var $ = function (id) { return document.getElementById(id); };

  var btn = $('ata-btn');
  var guide = $('guide');
  var closeBtn = $('guide-close');
  var tabs = Array.prototype.slice.call(guide.querySelectorAll('[role="tab"]'));
  var tip = $('ata-tip');
  var tipText = $('ata-tip-text');
  var hintsToggle = $('hints-toggle');

  var handlers = { onOpen: null, onClose: null };
  var tipTimer = null;
  var lastTipKey = null;

  /* ---------- справочник ---------- */

  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    guide.querySelector('.guide-body').scrollTop = 0;
  }

  function open(tabId) {
    if (!guide.hidden) return;
    hideTip();
    hintsToggle.checked = Store.get().hints;
    guide.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (tabId) selectTab($(tabId), false);
    closeBtn.focus();
    if (handlers.onOpen) handlers.onOpen();
  }

  function close() {
    if (guide.hidden) return;
    guide.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
    if (handlers.onClose) handlers.onClose();
  }

  btn.addEventListener('click', function () { if (guide.hidden) open(); else close(); });
  closeBtn.addEventListener('click', close);
  // клик по затемнению вокруг карточки тоже закрывает
  guide.addEventListener('click', function (e) { if (e.target === guide) close(); });

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t, false); });
    t.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); selectTab(next, true); }
    });
  });

  // фокус не уходит из открытого справочника
  guide.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var items = Array.prototype.filter.call(
      guide.querySelectorAll('button, input, [tabindex="0"]'),
      function (el) { return !el.disabled && el.offsetParent !== null; }
    );
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  hintsToggle.addEventListener('change', function () {
    Store.setFlag('hints', hintsToggle.checked);
    if (!hintsToggle.checked) hideTip();
  });

  /* ---------- подсказки ---------- */

  function showTip(text) {
    tipText.textContent = text;
    tip.hidden = false;
    btn.classList.add('is-talking');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 6500);
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tip.hidden = true;
    btn.classList.remove('is-talking');
  }

  $('ata-tip-close').addEventListener('click', hideTip);

  function pct(p) { return Math.round(p * 100) + '%'; }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* Правила разбора броска. Возвращает { key, text, important } или null.
     s — данные броска, которые собирает game.js:
       power, dirX         — сила 0..1 и горизонтальная составляющая направления
       sakaHit, firstCos   — попала ли сақа в асык и насколько прямо (1 = в центр)
       hitStone            — сақа ударилась о камень
       noTarget, missSide  — перед броском впереди не было асыков / сторона промаха
       fellShort           — сақа остановилась, не долетев до асыков
       knocked, remaining  — выбито этим броском / осталось в круге
       nearEdge            — сколько оставшихся асыков лежит у самой линии
       throwsLeft          — сколько бросков осталось у этого игрока */
  function analyze(s) {
    var n = s.knocked;
    var P = { p: pct(s.power), n: n, asyks: I18n.asyks(n) };

    if (n >= 2) return { key: 'multi', important: true, text: t(pick(['ata.multi1', 'ata.multi2']), P) };

    if (!s.sakaHit) {
      if (s.hitStone) return { key: 'stone', important: true, text: t('ata.stone') };
      if (s.noTarget) return { key: 'away', important: true, text: t('ata.away') };
      if (s.fellShort) return { key: 'short', important: true, text: t('ata.short', P) };
      if (s.missSide === 'left') return { key: 'miss-left', important: true, text: t('ata.missLeft') };
      if (s.missSide === 'right') return { key: 'miss-right', important: true, text: t('ata.missRight') };
      return { key: 'miss', important: true, text: t('ata.miss') };
    }

    if (n === 0) {
      if (s.power >= 0.9) return { key: 'strong', important: true, text: t('ata.strong', P) };
      if (s.firstCos < 0.55) return { key: 'glance', important: true, text: t('ata.glance') };
      if (s.power < 0.5) return { key: 'weak', important: true, text: t('ata.weak', P) };
      return { key: 'almost', important: true, text: t('ata.almost') };
    }

    // выбит ровно один
    if (s.nearEdge > 0 && s.throwsLeft > 0) return { key: 'edge', important: false, text: t('ata.edge') };
    if (Math.abs(s.dirX) < 0.12 && s.remaining >= 3 && s.throwsLeft > 0) return { key: 'row', important: false, text: t('ata.row') };
    return { key: 'one', important: false, text: t(pick(['ata.one1', 'ata.one2'])) };
  }

  /* Решаем, стоит ли говорить: промахи и крупные удачи — всегда,
     обычный +1 — примерно через раз, одну и ту же мысль подряд не повторяем. */
  function afterThrow(s) {
    if (!Store.get().hints || s.final) return;
    var res = analyze(s);
    if (!res) return;
    if (res.key === lastTipKey && res.key !== 'multi') return;
    if (!res.important && Math.random() < 0.5) return;
    lastTipKey = res.key;
    showTip(res.text);
  }

  window.AsykAta = {
    init: function (h) { handlers.onOpen = h.onOpen; handlers.onClose = h.onClose; },
    open: open,
    close: close,
    isOpen: function () { return !guide.hidden; },
    afterThrow: afterThrow,
    hideTip: hideTip,
    resetTips: function () { lastTipKey = null; hideTip(); },
    analyze: analyze
  };
})();
