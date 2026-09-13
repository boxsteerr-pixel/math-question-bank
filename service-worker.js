importScripts('./js/version.js');
const config=self.MATH_PWA_VERSION,CACHE=config.cacheVersion,ASSETS=['./','./index.html','./parent.html','./question-preview.html','./manifest.json','./css/style.css','./js/version.js','./js/app.js','./js/db.js','./js/questionEngine.js','./js/statistics.js','./js/wrongQuestions.js','./js/parentDashboard.js','./js/backup.js','./js/formatMath.js','./js/updateManager.js','./data/questions.json','./icons/app-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
/* Cache Storage holds only static program files. IndexedDB learning records are never touched here. */
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response.ok&&new URL(event.request.url).origin===location.origin)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response}).catch(()=>caches.match('./index.html'))))});
