// Real Chromium + IndexedDB + Cache Storage + service-worker lifecycle.
// Uses a fresh temporary browser context and a random loopback origin only.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {factorizationVariants} from './helpers/factorization-variants.js';
import {releaseAssets} from './pwa-release-audit.js';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright')}catch{playwright=require(path.join(process.env.PLAYWRIGHT_MODULE_ROOT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),'playwright'))}
const executablePath=process.env.PWA_TEST_BROWSER||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
assert.ok(executablePath,'需本机Chrome/Edge，禁止跳过浏览器验收');
const read=p=>fs.readFileSync(path.join(root,p));
const baseline=JSON.parse(read('tests/fixtures/pwa-release-350-baseline.json'));
// Pin the actual released v30 baseline. HEAD becomes v31 after this release,
// and must never silently redefine the old-device fixture.
const legacyRef='8f5fb1110f0bd9fcff23447ca2e5c2561af6bc86';
const tracked=new Set(execFileSync('git',['ls-tree','-r','--name-only',legacyRef],{cwd:root,encoding:'utf8'}).split(/\r?\n/));
const oldFiles=new Map;
for(const name of new Set([...Object.keys(baseline.frozenFiles),'data/questions.json','js/version.js','service-worker.js','parent.html','question-preview.html','icons/app-icon.svg']))if(tracked.has(name))oldFiles.set(name,execFileSync('git',['show',`${legacyRef}:${name}`],{cwd:root,maxBuffer:8*1024*1024}));
assert.equal(crypto.createHash('sha256').update(oldFiles.get('service-worker.js')).digest('hex'),baseline.releaseBefore['service-worker.js'],'旧SW必须是真实v30快照');
assert.equal(JSON.parse(oldFiles.get('data/questions.json')).length,287);
let stage='old';const requests=[];
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).slice(1)||'index.html';
  requests.push({stage,name});
  if(name==='__setup__.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><script src="/js/version.js"></script><p>Isolated PWA fixture</p>');return;}
  if(name.includes('..')||name.includes('\\')){res.writeHead(400);res.end();return;}
  const file=path.join(root,name),content=stage==='old'?oldFiles.get(name):fs.existsSync(file)&&fs.statSync(file).isFile()?fs.readFileSync(file):null;
  if(!content){res.writeHead(404);res.end('not found');return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('Service-Worker-Allowed','/');
  res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.html':'text/html'})[path.extname(name)]||'text/plain');res.end(content);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;const errors=[];const report={environment:'isolated Chromium; real IndexedDB and Cache Storage; not iPad hardware',origin,oldCache:'grade7-math-v30',newCache:'grade7-math-v31'};
const track=page=>page.on('pageerror',error=>errors.push(error.message));
async function snapshot(page){return page.evaluate(async()=>{
  const db=await import('/js/db.js'),out={};for(const store of ['dailyTasks','answers','wrongQuestions','knowledgeStats','checkins','questionHistory','settings'])out[store]=await db.all(store);return out;
})}
try{
  browser=await playwright.chromium.launch({executablePath,headless:true,args:['--disable-gpu']});
  const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'allow'});
  let page=await context.newPage();track(page);await page.goto(origin+'/__setup__.html');
  const seed=await page.evaluate(async()=>{
    const db=await import('/js/db.js'),engine=await import('/js/questionEngine.js'),wrong=await import('/js/wrongQuestions.js');
    await db.importQuestions();const date=engine.today(),yesterday=new Date(Date.now()-86400000).toLocaleDateString('en-CA');
    const task={date,questionIds:Array.from({length:10},(_,i)=>`Q${String(163+i).padStart(4,'0')}`),phase:'answering',currentIndex:0,startedAt:Date.now(),createdAt:Date.now()-10000};
    await db.put('dailyTasks',task);
    await db.put('answers',{key:yesterday+':Q0164',date:yesterday,questionId:'Q0164',firstAnswer:['4m^2-9n^2'],firstAttemptCorrect:false,initialSubmitted:true,resolved:false,attemptCount:1});
    await db.put('wrongQuestions',wrong.afterWrong({questionId:'Q0164'},yesterday));
    await db.put('knowledgeStats',{questionId:'合并同类项',knowledgePoint:'合并同类项',attempts:5,firstCorrect:3,last20Attempts:[true,false,true,false,true],recentAccuracy:60,consecutiveWrong:0});
    await db.put('checkins',{date:yesterday,firstCorrect:7,wrong:3,accuracy:70});
    await db.put('questionHistory',{questionId:'Q0001',shownCount:1,lastShownDate:yesterday});
    for(const [key,value] of [['questionBankFixVersion',2],['powerBoostStartCheckinCount',0],['parentPin','fixture-only-pin']])await db.saveSetting(key,value);
    localStorage.setItem('fixture-learning-sentinel','preserve');
    await(await caches.open('grade7-math-v1')).put('/old-sentinel',new Response('old'));
    await(await caches.open('another-project-static-v1')).put('/other-sentinel',new Response('preserve'));
    await navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;
    return {date,yesterday,task};
  });
  await page.goto(origin+'/');await page.locator('#start').waitFor();
  assert.equal(await page.evaluate(()=>globalThis.MATH_PWA_VERSION.cacheVersion),'grade7-math-v30');
  const before=await snapshot(page);assert.equal(await page.evaluate(async()=>(await(await import('/js/db.js')).all('questions')).length),287);
  stage='new';
  await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update()});
  await page.waitForFunction(()=>globalThis.MATH_PWA_VERSION?.cacheVersion==='grade7-math-v31'&&Boolean(document.querySelector('#start')),{},{timeout:30000});
  await page.waitForFunction(async()=>!(await caches.keys()).includes('grade7-math-v30'));
  const after=await snapshot(page);
  for(const store of ['dailyTasks','answers','wrongQuestions','knowledgeStats','checkins','questionHistory'])assert.deepEqual(after[store],before[store],'升级必须保留 '+store);
  const stableSettings=rows=>rows.filter(r=>r.key!=='questionBankVersion');
  assert.deepEqual(stableSettings(after.settings),stableSettings(before.settings));
  assert.equal(await page.evaluate(()=>localStorage.getItem('fixture-learning-sentinel')),'preserve');
  const runtime=await page.evaluate(async()=>{
    const db=await import('/js/db.js'),qs=await db.all('questions');return {count:qs.length,ids:qs.map(q=>q.id),constraints:qs.filter(q=>q.answerConstraint==='fully_factored').length,schema:db.DB_VERSION,fix:await db.setting('questionBankFixVersion',0),keys:await caches.keys()};
  });
  assert.equal(runtime.count,350);assert.equal(runtime.constraints,84);assert.equal(runtime.schema,3);assert.equal(runtime.fix,2);
  assert.deepEqual(runtime.ids,Array.from({length:350},(_,i)=>`Q${String(i+1).padStart(4,'0')}`));
  assert.ok(runtime.keys.includes('another-project-static-v1'));assert.ok(!runtime.keys.includes('grade7-math-v1'));assert.ok(!runtime.keys.includes('grade7-math-v30'));
  const preview=await context.newPage();track(preview);await preview.goto(origin+'/question-preview.html');
  await preview.waitForFunction(()=>document.querySelector('#preview-title')?.textContent==='350 题显示预览');
  assert.match(await preview.locator('#summary').textContent(),/已加载 350 题/);assert.equal(await preview.locator('article.preview').count(),350);
  await preview.close();
  for(const asset of releaseAssets){
    const name=asset==='./'?'index.html':asset.slice(2);
    const text=await page.evaluate(async asset=>{const response=await(await caches.open('grade7-math-v31')).match(asset);return response?response.text():null},asset);
    assert.equal(text,read(name).toString(),asset+'必须缓存当前文件，不能混用旧资源');
  }
  Object.assign(report,{runtimeLoad:runtime,sameDayTaskPreserved:true,oldLearningStoresPreserved:true,localStoragePreserved:true,precacheEntries:releaseAssets.length});
  // A separate no-SW UI fixture proves the heading isn't hard-coded to 350.
  const titleContext=await browser.newContext({serviceWorkers:'block'}),titlePage=await titleContext.newPage();track(titlePage);
  await titlePage.route('**/data/questions.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(JSON.parse(read('data/questions.json')).slice(0,3))}));
  await titlePage.goto(origin+'/question-preview.html');
  await titlePage.waitForFunction(()=>document.querySelector('#preview-title')?.textContent==='3 题显示预览');
  assert.match(await titlePage.locator('#summary').textContent(),/已加载 3 题/);await titleContext.close();
  report.previewTitle={runtimeCount:350,syntheticCount:3,dynamic:true};
  // Close the online page, turn networking off, and reopen the PWA. No API mocks.
  await page.close();await context.setOffline(true);page=await context.newPage();track(page);
  await page.goto(origin+'/',{waitUntil:'load'});await page.locator('#start').waitFor();
  assert.equal(await page.evaluate(()=>globalThis.MATH_PWA_VERSION.cacheVersion),'grade7-math-v31');
  assert.equal(await page.evaluate(async()=>(await(await import('/js/db.js')).all('questions')).length),350);
  assert.deepEqual((await snapshot(page)).dailyTasks,before.dailyTasks,'离线重开不能换题');
  const offlinePreview=await context.newPage();track(offlinePreview);await offlinePreview.goto(origin+'/question-preview.html');
  await offlinePreview.waitForFunction(()=>document.querySelector('#preview-title')?.textContent==='350 题显示预览');await offlinePreview.close();report.previewTitle.offlineCount=350;
  const reviews=JSON.parse(read('reports/fully_factored_phase_b/audit.json'));
  const representativeIds=['Q0163','Q0164','Q0165','Q0167'];
  const payload=representativeIds.map(id=>{
    const row=reviews.find(r=>r.id===id);return {id,counterexample:row.counterexample,variants:factorizationVariants(row.answer)};
  });
  report.factorized=await page.evaluate(async payload=>{
    const db=await import('/js/db.js'),{score,scoreForFrozenPolicy}=await import('/js/scoring.js'),{freezeTaskScoringPolicy}=await import('/js/scoringPolicy.js');
    const out=[];
    for(const row of payload){
      const q=await db.get('questions',row.id),old={questionIds:[q.id]},task=freezeTaskScoringPolicy(old,[q]);
      const good=scoreForFrozenPolicy(q,[q.answer],task),expanded=scoreForFrozenPolicy(q,[row.counterexample],task),unfinished=scoreForFrozenPolicy(q,[`1*(${row.counterexample})`],task),unknown=scoreForFrozenPolicy(q,['x^m'],task);
      if(!good.correct||expanded.correct||expanded.manualCheck||unfinished.correct||unfinished.manualCheck||!unknown.manualCheck)throw Error('运行时形式判分不正确 '+q.id);
      for(const variant of row.variants){const r=scoreForFrozenPolicy(q,[variant.input],task);if(!r.correct||r.manualCheck)throw Error('合法变体误判 '+q.id);}
      if(!scoreForFrozenPolicy(q,[row.counterexample],old).correct)throw Error('legacy被改变');
      out.push({id:q.id,standard:true,variants:row.variants.length,expandedRejected:true,unfinishedRejected:true,unsupportedManual:true,legacyUnchanged:true});
    }
    const mixed=await db.get('questions','Q0167');if(score(mixed,['xy(y^2-4)']).correct)throw Error('中间平方差未拒绝');
    const ordinary=await db.get('questions','Q0201');if(!score(ordinary,Array.isArray(ordinary.answer)?ordinary.answer:[ordinary.answer]).correct)throw Error('普通题回归');
    return out;
  },payload);
  // Exercise actual offline UI confirmation + saving, not just module imports.
  await page.locator('#start').click();await page.locator('[data-answer="0"]').fill('-3ma(a^2-2a+4)');
  await page.locator('#next').click();await page.locator('.confirm-overlay #confirm').click();
  await page.waitForFunction(()=>document.querySelector('[data-go="1"]')?.getAttribute('aria-current')==='step');
  const saved=await page.evaluate(async date=>{const db=await import('/js/db.js');return db.get('answers',date+':Q0163')},seed.date);
  assert.equal(saved.draftSaved,true);assert.deepEqual(saved.currentInputs,['-3ma(a^2-2a+4)']);assert.equal(saved.scoringPolicyVersion,1);
  for(const store of ['wrongQuestions','knowledgeStats','checkins'])assert.deepEqual((await snapshot(page))[store],before[store]);
  report.offline={reopened:true,questions:350,newModulesLoaded:true,existingTaskContinued:true,scoringPassed:true,confirmationAndDraftPersisted:true};
  // Next day uses the real task creation and persistence path while still offline.
  await page.clock.install({time:new Date(Date.now()+86400000)});
  const newTask=await page.evaluate(async()=>{const engine=await import('/js/questionEngine.js');return engine.getOrCreateToday()});
  assert.notEqual(newTask.date,seed.date);assert.equal(newTask.questionIds.length,10);assert.equal(newTask.scoringPolicyVersion,2);
  const policies=await page.evaluate(async task=>{
    const db=await import('/js/db.js');for(const id of task.questionIds){const q=await db.get('questions',id);if(task.scoringQuestionPolicies[id].answerConstraint!==(q.answerConstraint??null))throw Error('错误constraint快照 '+id);}return true;
  },newTask);assert.equal(policies,true);
  const newTaskAgain=await page.evaluate(async()=>(await import('/js/questionEngine.js')).getOrCreateToday());assert.deepEqual(newTaskAgain,newTask);
  report.newTask={version:2,count:10,snapshotsCorrect:true,sameDayStable:true};
  report.zeroSample=await page.evaluate(async()=>{
    const db=await import('/js/db.js'),engine=await import('/js/questionEngine.js'),{KNOWLEDGE_POINTS}=await import('/js/knowledgePoints.js'),{weaknessScore}=await import('/js/statistics.js'),{afterWrong}=await import('/js/wrongQuestions.js');
    const questions=await db.all('questions'),newPoints=['同底数幂乘法','同底数幂除法','幂的乘方','积的乘方','幂的运算综合','单项式乘法','多项式乘多项式','乘法公式','整式乘法综合','整式化简求值'];
    const oldPoints=KNOWLEDGE_POINTS.filter(p=>!newPoints.includes(p)),mature=knowledgePoint=>({knowledgePoint,attempts:10,firstCorrect:7,last20Attempts:[false,false,false,true,true,true,true,true,true,true],recentAccuracy:70,consecutiveWrong:0,historicalWrong:3});
    const zero=newPoints.map(knowledgePoint=>({knowledgePoint,attempts:0}));if(zero.some(s=>weaknessScore(s)!==0))throw Error('0样本被视为薄弱');
    const base={date:'2026-10-20',questions,enabled:KNOWLEDGE_POINTS,stats:[...oldPoints.map(mature),...zero],checkins:Array.from({length:5},(_,i)=>({date:`2026-10-0${i+1}`})),wrongQuestions:['Q0001','Q0002'].map(questionId=>afterWrong({questionId},'2026-10-19'))};
    const task=engine.buildAdaptiveTask(base),exposure=task.items.filter(i=>i.selectionReason==='unseen_knowledge_exposure');
    if(task.items.length!==10||exposure.length!==1||exposure[0].sourceType!=='review'||task.items.some(i=>i.sourceType==='weakness'&&newPoints.includes(i.targetKnowledgePoint))||task.items.filter(i=>i.sourceType==='wrong_review').length!==2)throw Error('真实350题零样本回归');
    const narrow=engine.buildAdaptiveTask({...base,enabled:['相反数',...newPoints],stats:[mature('相反数'),...zero]});
    if(narrow.items.length!==10||narrow.items.filter(i=>i.sourceType==='weakness').length!==4||narrow.items.filter(i=>i.sourceType==='review').length!==4)throw Error('weakness不足时补位错误');
    const point=exposure[0].targetKnowledgePoint,next=engine.buildAdaptiveTask({...base,stats:[...base.stats.filter(s=>s.knowledgePoint!==point),{knowledgePoint:point,attempts:1,firstCorrect:1,last20Attempts:[true],recentAccuracy:100}]});
    if(next.items.some(i=>i.selectionReason==='unseen_knowledge_exposure'&&i.targetKnowledgePoint===point))throw Error('首样本后未退出unseen');
    return {realQuestions:questions.length,weaknessEligible:false,maxOneExposure:true,learnedReviewFallback:true,firstSampleExits:true,wrongReviewPreserved:true};
  });
  const history=await snapshot(page);
  assert.deepEqual(history.answers.find(r=>r.key===before.answers[0].key),before.answers[0],'历史attempt不重判');
  for(const store of ['wrongQuestions','knowledgeStats','checkins'])assert.deepEqual(history[store],before[store]);
  assert.deepEqual(history.dailyTasks.find(t=>t.date===seed.date).questionIds,seed.task.questionIds);
  assert.ok(!Object.hasOwn(history.dailyTasks.find(t=>t.date===seed.date),'scoringPolicyVersion'));
  assert.deepEqual(errors,[],'不能存在JS运行时错误');report.pageErrors=errors;report.result='PASS';
  const folder=path.join(root,'reports/pwa_release_350');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PWA browser release PASS: real v30->v31 update; importQuestions/merge yields350; old learning data + task preserved; offline reopened/scored/saved; policy-v2 and real-bank unseen regression.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
