/* Service worker: игра работает без интернета после первого запуска.
   Свои файлы — «сначала кэш, потом обновить в фоне», шрифты Google — из кэша. */
'use strict';

var VERSION = 'asyk-v2';
var FONTS = 'asyk-fonts-v1';
var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/i18n.js',
  './js/levels.js',
  './js/storage.js',
  './js/audio.js',
  './js/physics.js',
  './js/render.js',
  './js/ata.js',
  './js/bot.js',
  './js/game.js',
  './manifest.webmanifest',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== FONTS; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; });
      });
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res.ok) c.put(req, res.clone());
        return res;
      }).catch(function () {
        return hit || (req.mode === 'navigate' ? c.match('./index.html') : Response.error());
      });
      return hit || net;
    });
  }));
});
