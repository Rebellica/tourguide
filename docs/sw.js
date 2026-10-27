// 简单离线缓存：优先使用缓存，后台更新
var CACHE = "tourguide-v4";
var CORE = [
  "./", "./index.html", "./css/style.css?v=3", "./js/app.js", "./manifest.json",
  "./data/questions.json", "./data/guide.json", "./data/interview_qa.json"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      var fetchPromise = fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var resClone = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, resClone); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || fetchPromise;
    })
  );
});
