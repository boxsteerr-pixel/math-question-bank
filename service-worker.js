importScripts('./js/version.js');

const config = self.MATH_PWA_VERSION;
const CACHE = config.cacheVersion;
const CACHE_PREFIX = 'grade7-math-v';
const scope = self.registration.scope;
const assets = [
  './', './index.html', './parent.html', './question-preview.html', './manifest.json',
  './css/style.css', './js/version.js', './js/app.js', './js/questionPreview.js',
  './js/db.js', './js/questionBankFix.js', './js/questionEngine.js', './js/scoring.js',
  './js/factorizedForm.js', './js/scoringPolicy.js', './js/attemptPolicy.js',
  './js/knowledgePoints.js', './js/statistics.js', './js/wrongQuestions.js',
  './js/parentDashboard.js', './js/backup.js', './js/formatMath.js', './js/updateManager.js',
  './data/questions.json', './icons/app-icon.svg'
].map(path => new URL(path, scope).href);
const assetSet = new Set(assets);
const clientPin = id => new URL('./.pwa-client/' + id, scope).href;

function releaseNumber(name) {
  if (!name.startsWith(CACHE_PREFIX)) return NaN;
  const suffix = name.slice(CACHE_PREFIX.length);
  return /^\d+$/.test(suffix) ? Number(suffix) : NaN;
}

async function precedingCache() {
  const currentVersion = releaseNumber(CACHE);
  const older = (await caches.keys())
    .filter(name => releaseNumber(name) < currentVersion)
    .sort((a, b) => releaseNumber(b) - releaseNumber(a));
  for (const name of older) {
    const cache = await caches.open(name);
    // A failed install may have created an empty cache for a skipped release.
    if (await cache.match(new URL('./index.html', scope).href)) return name;
  }
}

self.addEventListener('install', event => {
  // Cache.addAll commits the shell as a unit. A failed download leaves the active
  // worker and its complete offline shell in place.
  event.waitUntil(caches.open(CACHE).then(cache => {
    return cache.addAll(assets.map(url => new Request(url, { cache: 'reload' })));
  }));
});

self.addEventListener('activate', event => {
  // Keep the previous shell for any navigation that began during the handoff.
  // No client is claimed here, including on a first visit.
  event.waitUntil((async () => {
    const previous = await precedingCache();
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => {
      return releaseNumber(key) < releaseNumber(CACHE) && key !== previous;
    }).map(key => caches.delete(key)));
  })());
});

async function applyUpdate(source, port) {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const inScope = pages.filter(page => page.url.startsWith(scope));
  if (inScope.length !== 1 || inScope[0].id !== source.id) {
    port.postMessage({ status: 'blocked' });
    return;
  }
  await self.skipWaiting();
  port.postMessage({ status: 'activating' });
}

self.addEventListener('message', event => {
  const source = event.source;
  const port = event.ports[0];
  if (!port || source?.type !== 'window' || !source.url.startsWith(scope)) return;
  if (event.data?.type === 'GET_RELEASE') {
    port.postMessage({ appVersion: config.appVersion });
  }
  // The v34 page sends SKIP_WAITING and unconditionally reloads on takeover.
  // It must remain controlled by v34 until the browser has released all its clients.
  if (event.data?.type === 'APPLY_SAFE_UPDATE') {
    event.waitUntil(applyUpdate(source, port).catch(() => port.postMessage({ status: 'retry' })));
  }
});

async function serveStatic(event, url) {
  const ownCache = await caches.open(CACHE);
  if (event.request.mode === 'navigate') {
    // Persist the release chosen for this document before returning its HTML,
    // including when another update is about to replace this worker.
    if (event.resultingClientId) {
      await ownCache.put(clientPin(event.resultingClientId), new Response(''));
    }
    return await ownCache.match(url) ?? new Response('', { status: 503 });
  }
  if (event.clientId && !await ownCache.match(clientPin(event.clientId))) {
    const previous = await precedingCache();
    if (previous) {
      const previousCache = await caches.open(previous);
      if (await previousCache.match(clientPin(event.clientId))) {
        return await previousCache.match(url) ?? new Response('', { status: 503 });
      }
    }
  }
  return await ownCache.match(url) ?? new Response('', { status: 503 });
}

// Cache Storage here contains program files and document release markers.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  const path = url.href.startsWith(scope) ? url.href.slice(scope.length) : '';
  const staticDirectory = /^(?:js|css|data|icons)\//.test(path);
  if (assetSet.has(url.href) || staticDirectory) {
    event.respondWith(serveStatic(event, url.href));
  }
});
