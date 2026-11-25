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
  for(const done of [false,true]){
    const {context,page}=await setup(['相反数'],done);
    const expected={enabled:['相反数'],saved:['相反数'],done,other:'preserved'};
    assert.deepEqual(await read(page),expected);
    assert.deepEqual(await parent(page),expected.enabled);
    assert.deepEqual(await student(page),expected.enabled);
    await page.reload();
    assert.deepEqual(await read(page),expected,'有无历史迁移标记都应保留明确选择');
    await context.close();
  }
  results.legacySelectionAndMarkerPreserved='PASS';
  {
    const {context,page}=await setup(['相反数','绝对值','合并同类项'],false);
    await parent(page);
    await page.locator('input[value="绝对值"]').uncheck();
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#parent-scope-status').textContent.includes('已保存'));
    assert.deepEqual(await student(page),['相反数','合并同类项']);
    assert.deepEqual(await parent(page),['相反数','合并同类项']);
    assert.equal((await read(page)).done,false);
    const result=await page.evaluate(async()=>{
      const db=await import('/js/db.js'),engine=await import('/js/questionEngine.js');
      const before=await db.all('settings'),put=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(){throw new DOMException('forced write failure','DataError')};
      let reason;
      try{await engine.saveLearningScope(['绝对值'])}catch(error){reason=error.message}
      finally{IDBObjectStore.prototype.put=put}
      return {reason,before,after:await db.all('settings')};
    });
    assert.match(result.reason,/forced write failure/);
    assert.deepEqual(result.after,result.before);
    results.validSaveAndNativeAbort='PASS';await context.close();
  }
  {
    const {context,page}=await setup(null,false);const state=await read(page);
    assert.ok(state.enabled.includes('整式乘除综合'));assert.ok(state.enabled.includes('因式分解·平方差公式'));
    assert.equal(state.saved,null);assert.equal(state.done,false);
    results.newUserDefaults='PASS';await context.close();
  }
  {
    const {context,page}=await setup([],true);
    assert.deepEqual((await read(page)).enabled,[]);
    await page.goto(origin+'/');await page.locator('#adjust-scope').click();
    assert.equal(await page.locator('#save-settings').isDisabled(),true);
    assert.deepEqual((await read(page)).saved,[]);
    results.savedEmpty='PASS';await context.close();
  }
  console.log(JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
