import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright')}catch{playwright=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const executablePath=process.env.PWA_TEST_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
 if(name==='fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>isolated</title>');return}
 if(name.startsWith('legacy/js/')){
   try{
     const bytes=execFileSync('git',['show','918f5d2:'+name.slice('legacy/'.length)],{cwd:root});
     res.setHeader('Content-Type','text/javascript');res.end(bytes);return;
   }catch{res.writeHead(404).end();return}
 }
 const file=path.join(root,name);
 if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404).end();return}
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'application/json');
 fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await playwright.chromium.launch({executablePath,headless:true});
 const context=await browser.newContext({serviceWorkers:'block'});
 const a=await context.newPage(),b=await context.newPage();
 await Promise.all([a.goto(origin+'/fixture'),b.goto(origin+'/fixture')]);
 // Disable optional coordination before modules load.
 await Promise.all([a,b].map(page=>page.evaluate(()=>Object.defineProperty(navigator,'locks',{value:undefined}))));
 const setup=page=>page.evaluate(async()=>{
   globalThis.MATH_PWA_VERSION={dbVersion:4,questionBankVersion:'test'};
   window.db=await import('/js/db.js');
   await db.openDB();
 });
 await setup(a);await setup(b);
 await b.evaluate(()=>db.put('settings',{key:'old',value:'before'}));
 await b.evaluate(()=>{
   window.pendingWrite=new Promise(resolve=>{window.releasePending=resolve}).then(()=>
     db.put('settings',{key:'delayed',value:'old'}).then(()=>false,error=>error.name)
   );
 });
 const snapshot=await a.evaluate(()=>db.readLearningData());
 const replacement=structuredClone(snapshot);
 replacement.settings=[{key:'recovered',value:'safe'}];
 const failed=await a.evaluate(async data=>{
   const put=IDBObjectStore.prototype.add;
   IDBObjectStore.prototype.add=function(value,...rest){
     if(this.name==='settings')throw Error('injected failure');
     return put.call(this,value,...rest);
   };
   try{await db.restoreLearningData(data);return 'unexpected-success'}
   catch(error){return error.message}
   finally{IDBObjectStore.prototype.add=put}
 },replacement);
 assert.match(failed,/injected failure/);
 assert.deepEqual(await a.evaluate(()=>db.readLearningData()),snapshot);
 const genAfterFailure=await a.evaluate(async()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('grade7MathCheckin',4);
   request.onsuccess=()=>{const db=request.result;const tx=db.transaction('learningMetadata');const get=tx.objectStore('learningMetadata').get('learningDataGeneration');get.onsuccess=()=>{resolve(get.result.value);db.close()}};
   request.onerror=()=>reject(request.error);
 }));
 assert.equal(genAfterFailure,0);
 await a.evaluate(data=>db.restoreLearningData(data),replacement);
 const attempts=await b.evaluate(async()=>{
   const results=[];
   for(const [store,row] of [
     ['answers',{key:'2026-01-01:Q1',date:'2026-01-01',questionId:'Q1'}],
     ['dailyTasks',{date:'2026-01-01',questionIds:['Q1']}],
     ['knowledgeStats',{questionId:'test',attempts:1}],
     ['settings',{key:'stale',value:true}]
   ]){
     try{await db.put(store,row);results.push('accepted')}
     catch(error){results.push(error.name)}
   }
   return results;
 });
 assert.deepEqual(attempts,Array(4).fill('StaleLearningDataError'));
 assert.equal(await b.evaluate(async()=>{releasePending();return pendingWrite}),'StaleLearningDataError');
 const fresh=await context.newPage();await fresh.goto(origin+'/fixture');await setup(fresh);
 assert.deepEqual(await fresh.evaluate(()=>db.readLearningData()),replacement);
 const legacy=await fresh.evaluate(()=>new Promise(resolve=>{
   const req=indexedDB.open('grade7MathCheckin',3);
   req.onsuccess=()=>{req.result.close();resolve('unexpected-success')};
   req.onerror=()=>resolve(req.error.name);
 }));
 assert.equal(legacy,'VersionError');
 const another=await context.newPage();await another.goto(origin+'/fixture');await setup(another);
 const left=structuredClone(replacement),right=structuredClone(replacement);
 left.settings=[{key:'first',value:'one'}];
 right.settings=[{key:'second',value:'two'}];
 const outcomes=await Promise.all([
   fresh.evaluate(data=>db.restoreLearningData(data).then(()=>true,()=>false),left),
   another.evaluate(data=>db.restoreLearningData(data).then(()=>true,()=>false),right)
 ]);
 assert.deepEqual(outcomes.slice().sort(),[false,true],'concurrent restore must serialize and reject stale caller');
 const verify=await context.newPage();await verify.goto(origin+'/fixture');await setup(verify);
 assert.deepEqual(await verify.evaluate(()=>db.readLearningData()),outcomes[0]?left:right);
 const counter=await verify.evaluate(async()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('grade7MathCheckin',4);
   request.onsuccess=()=>{const db=request.result;const tx=db.transaction('learningMetadata');const get=tx.objectStore('learningMetadata').get('learningDataGeneration');get.onsuccess=()=>{resolve(get.result.value);db.close()}};
   request.onerror=()=>reject(request.error);
 }));
 assert.equal(counter,2,'exactly two committed restores advance the generation');
 const backupFile={backupVersion:1,createdAt:new Date().toISOString(),appVersion:'0.5.2',stores:replacement};
 await verify.evaluate(async file=>{const backup=await import('/js/backup.js');await backup.importBackup(file)},backupFile);
 const rollback=await context.newPage();await rollback.goto(origin+'/fixture');await setup(rollback);
 await rollback.evaluate(async()=>{
   const backup=await import('/js/backup.js'),snapshot=await backup.readRestoreSnapshot();
   if(!snapshot)throw Error('recovery snapshot missing');
   await backup.rollbackRestoreSnapshot(snapshot);
 });
 const last=await context.newPage();await last.goto(origin+'/fixture');await setup(last);
 assert.deepEqual(await last.evaluate(()=>db.readLearningData()),outcomes[0]?left:right);
 const finalGeneration=await last.evaluate(async()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('grade7MathCheckin',4);
   request.onsuccess=()=>{const db=request.result;const tx=db.transaction('learningMetadata');const get=tx.objectStore('learningMetadata').get('learningDataGeneration');get.onsuccess=()=>{resolve(get.result.value);db.close()}};
   request.onerror=()=>reject(request.error);
 }));
 assert.equal(finalGeneration,4,'import and snapshot rollback increment generation independently');
 await context.close();
 const legacyContext=await browser.newContext({serviceWorkers:'block'});
 const oldPage=await legacyContext.newPage();await oldPage.goto(origin+'/fixture');
 await oldPage.evaluate(async()=>{
   globalThis.MATH_PWA_VERSION={dbVersion:3,questionBankVersion:'old'};
   window.old=await import('/legacy/js/db.js');
   await old.put('settings',{key:'legacy',value:'preserved'});
   await old.put('dailyTasks',{date:'2026-01-01',questionIds:['Q0001'],startedAt:123});
   await old.put('answers',{key:'2026-01-01:Q0001',date:'2026-01-01',questionId:'Q0001',currentInputs:['draft'],draftSaved:true});
 });
 const beforeUpgrade=await oldPage.evaluate(async()=>Object.fromEntries(await Promise.all(['dailyTasks','answers','wrongQuestions','knowledgeStats','questionHistory','checkins','settings'].map(async name=>[name,await old.all(name)]))));
 const upgrade=await legacyContext.newPage();await upgrade.goto(origin+'/fixture');await setup(upgrade);
 assert.deepEqual(await upgrade.evaluate(()=>db.readLearningData()),beforeUpgrade);
 await upgrade.evaluate(data=>db.restoreLearningData(data),beforeUpgrade);
 const legacyWrite=await oldPage.evaluate(async()=>{
   try{await old.put('answers',{key:'stale',currentInputs:['unsafe']});return 'unexpected-success'}
   catch(error){return error.message}
 });
 assert.match(legacyWrite,/version|lower/i);
 assert.deepEqual(await upgrade.evaluate(()=>db.readLearningData()),beforeUpgrade);
 await legacyContext.close();
 const blockedContext=await browser.newContext({serviceWorkers:'block'});
 const held=await blockedContext.newPage(),blocked=await blockedContext.newPage();
 await Promise.all([held.goto(origin+'/fixture'),blocked.goto(origin+'/fixture')]);
 await held.evaluate(async()=>{
   globalThis.MATH_PWA_VERSION={dbVersion:3,questionBankVersion:'old'};
   window.old=await import('/legacy/js/db.js');
   await old.put('settings',{key:'keep',value:'legacy'});
   window.held=await new Promise((resolve,reject)=>{const req=indexedDB.open('grade7MathCheckin',3);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
   held.onversionchange=()=>{};
 });
 await blocked.evaluate(()=>{globalThis.MATH_PWA_VERSION={dbVersion:4,questionBankVersion:'new'}});
 const blockedResult=await blocked.evaluate(async()=>{
   window.db=await import('/js/db.js');
   try{await db.openDB();return 'unexpected-success'}catch(error){return error.message}
 });
 assert.match(blockedResult,/关闭旧版页面/);
 await held.evaluate(()=>held.close());
 await new Promise(resolve=>setTimeout(resolve,100));
 const stillVersion3=await blocked.evaluate(()=>new Promise(resolve=>{
   const request=indexedDB.open('grade7MathCheckin',3);
   request.onsuccess=()=>{resolve(request.result.version);request.result.close()};
   request.onerror=()=>resolve(request.error.name);
 }));
 assert.equal(stillVersion3,3,'blocked abandoned request must not upgrade later');
 await blockedContext.close();
 console.log('Native IndexedDB: no-lock stale writes rejected, full restore preserved, v3 reconnect rejected.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
