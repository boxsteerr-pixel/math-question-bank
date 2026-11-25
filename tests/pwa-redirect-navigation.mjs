import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const playwright=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browserPath=process.env.PWA_TEST_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let rejectAuth=false;
let authPage=false;
const server=http.createServer((req,res)=>{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  if(authPage&&name==='parent.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Sign in</title>');return}
  if(['parent.html','question-preview.html','index.html'].includes(name)){
    res.writeHead(308,{Location:rejectAuth&&name==='parent.html'?'/login':'/'+name.slice(0,-5),'Cache-Control':'no-store'});res.end();return;
  }
  if(name==='login'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Sign in</title>');return}
  if(name==='parent'||name==='question-preview'||name==='index')name+='.html';
  if(!name)name='index.html';
  const file=path.join(root,name);
  if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return}
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await playwright.chromium.launch({executablePath:browserPath,headless:true});
  const context=await browser.newContext({serviceWorkers:'allow'}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/');await page.locator('#start').waitFor();
  const network=await page.evaluate(async()=>{const response=await fetch('./parent.html');return {redirected:response.redirected,url:response.url,type:response.type}});
  assert.deepEqual(network,{redirected:true,url:origin+'/parent',type:'basic'});
  await page.evaluate(()=>Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('worker install timed out')),10000))]));
  await page.reload();await page.locator('#parent').waitFor();
  const cacheBefore=await page.evaluate(async()=>{
    const cache=await caches.open(MATH_PWA_VERSION.cacheVersion),response=await cache.match('./parent.html');
    return response&&{redirected:response.redirected,url:response.url,type:response.type};
  });
  console.log('cached parent before navigation',JSON.stringify(cacheBefore));
  assert.deepEqual(cacheBefore,{redirected:false,url:'',type:'default'});
  await Promise.all([page.waitForURL('**/parent.html',{timeout:10000}),page.locator('#parent').click()]);
  await page.locator('#export').waitFor();
  await Promise.all([page.waitForURL(origin+'/',{timeout:10000}),page.locator('#back').click()]);
  await page.locator('#start').waitFor();
  await context.setOffline(true);
  await Promise.all([page.waitForURL('**/parent.html',{timeout:10000}),page.locator('#parent').click()]);
  await page.locator('#export').waitFor();
  await Promise.all([page.waitForURL(origin+'/',{timeout:10000}),page.locator('#back').click()]);
  await page.locator('#start').waitFor();
  assert.deepEqual(errors,[]);
  console.log('Redirected HTML navigation and offline return PASS');
  await context.close();
  rejectAuth=true;
  const gated=await browser.newContext({serviceWorkers:'allow'}),gatePage=await gated.newPage();
  await gatePage.goto(origin+'/');await gatePage.locator('#start').waitFor();
  await gatePage.waitForTimeout(1500);
  const invalid=await gatePage.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();const c=await caches.open(MATH_PWA_VERSION.cacheVersion);return {active:!!r?.active,parent:!!(await c.match('./parent.html')),login:!!(await c.match('./login'))}});
  assert.deepEqual(invalid,{active:false,parent:false,login:false},'authentication redirect must not become offline content');
  await gated.close();
  rejectAuth=false;authPage=true;
  const fake=await browser.newContext({serviceWorkers:'allow'}),fakePage=await fake.newPage();
  await fakePage.goto(origin+'/');await fakePage.locator('#start').waitFor();await fakePage.waitForTimeout(1500);
  const sameUrlAuth=await fakePage.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();const cache=await caches.open(MATH_PWA_VERSION.cacheVersion);return {active:!!registration?.active,parent:!!(await cache.match('./parent.html'))}});
  assert.deepEqual(sameUrlAuth,{active:false,parent:false},'a successful HTML login page cannot become the offline parent page');
  await fake.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
