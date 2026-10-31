import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright')}catch{playwright=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const executablePath=process.env.PWA_TEST_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
assert.ok(executablePath,'需要Chrome或Edge进行真实IndexedDB测试');
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';if(name.includes('..')||name.includes('\\')){res.writeHead(400).end();return}const file=path.join(root,name);if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return}res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');fs.createReadStream(file).pipe(res)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;const results={};
try{
  browser=await playwright.chromium.launch({executablePath,headless:true});
  async function setup(selected,done){
    const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
    await page.goto(origin+'/question-preview.html');
    await page.evaluate(async ({selected,done})=>{const db=await import('/js/db.js');if(selected!==null)await db.saveSetting('enabledKnowledgePoints',selected);if(done)await db.saveSetting('integratedPolynomialMulDivScopeIntroduced',true);await db.saveSetting('testOtherSetting','preserved')},{selected,done});
    return {context,page};
  }
  async function read(page){return page.evaluate(async()=>{const db=await import('/js/db.js'),engine=await import('/js/questionEngine.js');return {enabled:await engine.enabledPoints(),saved:await db.setting('enabledKnowledgePoints',null),done:await db.setting('integratedPolynomialMulDivScopeIntroduced',false),other:await db.setting('testOtherSetting',null)}})}
  async function parent(page){await page.goto(origin+'/parent.html');await page.locator('input[value="整式乘除综合"]').waitFor();return page.locator('input:checked').evaluateAll(els=>els.map(e=>e.value))}
  async function student(page){await page.goto(origin+'/');await page.locator('#settings').click();await page.locator('input[value="整式乘除综合"]').waitFor();return page.locator('input:checked').evaluateAll(els=>els.map(e=>e.value))}
  {
    const {context,page}=await setup(['相反数'],true);assert.deepEqual((await read(page)).enabled,['相反数']);assert.deepEqual(await parent(page),['相反数']);await page.reload();assert.deepEqual(await parent(page),['相反数']);results.case1='PASS';await context.close();
  }
  {
    const {context,page}=await setup(['相反数'],false);const a=await read(page);assert.deepEqual(a.enabled,['相反数','整式乘除综合']);assert.deepEqual(a.saved,a.enabled);assert.equal(a.done,true);assert.equal(a.other,'preserved');results.case2='PASS';
    await page.reload();assert.deepEqual((await read(page)).enabled,a.enabled);assert.deepEqual(await parent(page),a.enabled);await page.reload();assert.deepEqual(await parent(page),a.enabled);results.case3='PASS';
    await page.locator('input[value="整式乘除综合"]').uncheck();const dialogPromise=page.waitForEvent('dialog').then(async dialog=>{assert.equal(dialog.type(),'alert');assert.match(dialog.message(),/已保存/);await dialog.accept()});await Promise.all([dialogPromise,page.locator('#save').click()]);await page.close();const reopened=await context.newPage();assert.deepEqual(await parent(reopened),['相反数']);assert.deepEqual((await read(reopened)).enabled,['相反数']);assert.equal((await read(reopened)).done,true);await reopened.reload();assert.deepEqual(await parent(reopened),['相反数']);assert.deepEqual(await student(reopened),['相反数']);assert.equal((await read(reopened)).done,true);results.case4='PASS';results.studentRealPage='PASS';await context.close();
  }
  {
    const {context,page}=await setup(['相反数'],true);assert.deepEqual((await read(page)).enabled,['相反数']);assert.deepEqual(await parent(page),['相反数']);results.case5='PASS';await context.close();
  }
  {
    const {context,page}=await setup(['相反数'],false);
    const a=await page.evaluate(async()=>{const db=await import('/js/db.js'),points=await import('/js/knowledgePoints.js');const put=IDBObjectStore.prototype.put;let calls=0;IDBObjectStore.prototype.put=function(...args){if(++calls===2)throw new DOMException('forced failure','DataError');return put.apply(this,args)};let rejected=false;try{await db.ensurePolynomialDivisionScope(points.KNOWLEDGE_POINTS)}catch{rejected=true}finally{IDBObjectStore.prototype.put=put}return {rejected,saved:await db.setting('enabledKnowledgePoints',null),done:await db.setting('integratedPolynomialMulDivScopeIntroduced',false)}});
    assert.equal(a.rejected,true);assert.deepEqual(a.saved,['相反数']);assert.equal(a.done,false);const b=await read(page);assert.deepEqual(b.saved,['相反数','整式乘除综合']);assert.equal(b.done,true);results.case6='PASS';await context.close();
  }
  {
    const {context,page}=await setup(['相反数','绝对值','合并同类项'],false);const initial=await read(page);assert.deepEqual(initial.saved,['相反数','绝对值','合并同类项','整式乘除综合']);await parent(page);await page.locator('input[value="绝对值"]').uncheck();const dialogPromise=page.waitForEvent('dialog').then(dialog=>dialog.accept());await Promise.all([dialogPromise,page.locator('#save').click()]);assert.deepEqual(await student(page),['相反数','合并同类项','整式乘除综合']);assert.deepEqual(await parent(page),['相反数','合并同类项','整式乘除综合']);results.multipleSelections='PASS';await context.close();
  }
  {
    const {context,page}=await setup(null,false);const a=await read(page);assert.ok(a.enabled.includes('整式乘除综合'));assert.ok(a.enabled.includes('因式分解·平方差公式'));results.newUser='PASS';await context.close();
  }
  {
    const {context,page}=await setup([],true);assert.deepEqual((await read(page)).enabled,[]);results.savedEmpty='PASS (read preserves empty; existing UI refuses saving an empty selection)';await context.close();
  }
  console.log(JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
