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
const baseline=JSON.parse(read('tests/fixtures/pwa-release-368-baseline.json'));
// Pin the actual v34 release; the candidate is always read from the worktree.
const safety=JSON.parse(read('tests/fixtures/pwa-stability-approved-changes.json'));
const redirect=JSON.parse(read('tests/fixtures/pwa-redirect-approved-changes.json'));
const fencing=JSON.parse(read('tests/fixtures/pwa-fencing-approved-changes.json'));
const legacyRef=safety.baselineRef,bankCount=baseline.expectedCount;
const tracked=new Set(execFileSync('git',['ls-tree','-r','--name-only',legacyRef],{cwd:root,encoding:'utf8'}).split(/\r?\n/));
const oldFiles=new Map;
for(const name of new Set([...Object.keys(baseline.frozenFiles),'data/questions.json','js/version.js','service-worker.js','parent.html','question-preview.html','icons/app-icon.svg']))if(tracked.has(name))oldFiles.set(name,execFileSync('git',['show',`${legacyRef}:${name}`],{cwd:root,maxBuffer:8*1024*1024}));
assert.equal(crypto.createHash('sha256').update(oldFiles.get('service-worker.js')).digest('hex'),safety.files['service-worker.js'].before,'旧 SW 必须是真实 v34 快照');
assert.equal(JSON.parse(oldFiles.get('data/questions.json')).length,bankCount);
let stage='old';const requests=[];
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).slice(1)||'index.html';
  requests.push({stage,name});
  if(name==='__setup__.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><script src="/js/version.js"></script><p>Isolated PWA fixture</p>');return;}
  if(name.includes('..')||name.includes('\\')){res.writeHead(400);res.end();return;}
  const file=path.join(root,name);
  let content=stage==='old'?oldFiles.get(name):fs.existsSync(file)&&fs.statSync(file).isFile()?fs.readFileSync(file):null;
  if(stage==='broken'&&name==='js/app.js'){res.writeHead(503);res.end('simulated release download failure');return;}
  if(['broken','forward','correction'].includes(stage)&&name==='js/version.js'){
    const next=stage==='correction'?['0.5.5','grade7-math-v39']:['0.5.4','grade7-math-v38'];
    content=String(content).replace(redirect.appVersion,next[0]).replace(redirect.cache,next[1]);
  }
  if(!content){res.writeHead(404);res.end('not found');return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('Service-Worker-Allowed','/');
  res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.html':'text/html'})[path.extname(name)]||'text/plain');res.end(content);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;const errors=[];const report={environment:'isolated Chromium; real IndexedDB and Cache Storage; not iPad hardware',origin,oldCache:safety.previousCache,newCache:redirect.cache};
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
    let mastered=wrong.afterWrong({questionId:'Q0165'},yesterday);
    for(let i=0;i<3;i++)mastered=wrong.afterReviewCorrect(mastered);
    await db.put('wrongQuestions',mastered);
    await db.put('knowledgeStats',{questionId:'合并同类项',knowledgePoint:'合并同类项',attempts:5,firstCorrect:3,last20Attempts:[true,false,true,false,true],recentAccuracy:60,consecutiveWrong:0});
    await db.put('checkins',{date:yesterday,firstCorrect:7,wrong:3,accuracy:70});
    await db.put('questionHistory',{questionId:'Q0001',shownCount:1,lastShownDate:yesterday});
    for(const [key,value] of [['questionBankFixVersion',2],['powerBoostStartCheckinCount',0],['parentPin','fixture-only-pin'],['enabledKnowledgePoints',['相反数','绝对值']],['integratedPolynomialMulDivScopeIntroduced',true]])await db.saveSetting(key,value);
    localStorage.setItem('fixture-learning-sentinel','preserve');
    await(await caches.open('grade7-math-v1')).put('/old-sentinel',new Response('old'));
    await(await caches.open('another-project-static-v1')).put('/other-sentinel',new Response('preserve'));
    await navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;
    return {date,yesterday,task};
  });
  await page.goto(origin+'/');await page.locator('#start').waitFor();
  assert.equal(await page.evaluate(()=>globalThis.MATH_PWA_VERSION.cacheVersion),safety.previousCache);
  const before=await snapshot(page);assert.equal(await page.evaluate(async()=>(await(await import('/js/db.js')).all('questions')).length),bankCount);
  const beforeQuestions=await page.evaluate(async()=>(await(await import('/js/db.js')).all('questions')));
  const oldPractice=await context.newPage();track(oldPractice);
  await oldPractice.goto(origin+'/');await oldPractice.locator('#start').click();
  await oldPractice.locator('[data-answer="0"]').fill('更新检查中的输入');
  stage='new';
  await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update()});
  await oldPractice.locator('#app-update button').click();
  assert.equal(await oldPractice.locator('[data-answer="0"]').inputValue(),'更新检查中的输入');
  assert.equal(await oldPractice.evaluate(()=>globalThis.MATH_PWA_VERSION.cacheVersion),safety.previousCache);
  assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),true);
  await oldPractice.locator('[data-answer="0"]').fill('');
  await oldPractice.close();await page.close();
  // v34 has no safe activation handshake. Its last client must release control.
  await new Promise(resolve=>setTimeout(resolve,800));
  page=await context.newPage();track(page);await page.goto(origin+'/');
  await page.waitForFunction(cache=>globalThis.MATH_PWA_VERSION?.cacheVersion===cache&&Boolean(document.querySelector('#start')),redirect.cache,{timeout:30000});
  assert.ok(await page.evaluate(cache=>caches.has(cache),safety.previousCache));
  const after=await snapshot(page);
  for(const store of ['dailyTasks','answers','wrongQuestions','knowledgeStats','checkins','questionHistory'])assert.deepEqual(after[store],before[store],'升级必须保留 '+store);
  assert.equal(after.settings.find(r=>r.key==='unfinishedPracticeStartDate')?.value,seed.date);
  const stableSettings=rows=>rows.filter(r=>!['questionBankVersion','unfinishedPracticeStartDate','integratedPolynomialMulDivScopeIntroduced','enabledKnowledgePoints'].includes(r.key));
  assert.deepEqual(stableSettings(after.settings),stableSettings(before.settings));
  assert.deepEqual(after.settings.find(r=>r.key==='enabledKnowledgePoints').value,['相反数','绝对值']);
  assert.deepEqual(after.settings.find(r=>r.key==='integratedPolynomialMulDivScopeIntroduced'),before.settings.find(r=>r.key==='integratedPolynomialMulDivScopeIntroduced'));
  const rangePage=await context.newPage();track(rangePage);await rangePage.goto(origin+'/parent.html');
  await rangePage.locator('input[value="相反数"]').uncheck();
  await rangePage.locator('input[value="绝对值"]').uncheck();
  await rangePage.locator('input[value="幂的乘方"]').check();
  assert.match(await rangePage.locator('#parent-scope-status').textContent(),/可用 1 道正式题.*还差 9 道/);
  assert.equal(await rangePage.locator('#save').isDisabled(),true);
  await rangePage.close();
  const rangeReopen=await context.newPage();await rangeReopen.goto(origin+'/parent.html');
  assert.equal(await rangeReopen.locator('input[value="整式乘除综合"]').isChecked(),false);
  assert.equal(await rangeReopen.locator('input[value="绝对值"]').isChecked(),true);
  const backupDownload=rangeReopen.waitForEvent('download');await rangeReopen.locator('#export').click();
  assert.match((await backupDownload).suggestedFilename(),/^math-learning-backup-/);
  await rangeReopen.close();
  assert.equal(await page.evaluate(()=>localStorage.getItem('fixture-learning-sentinel')),'preserve');
  const runtime=await page.evaluate(async()=>{
    const db=await import('/js/db.js'),qs=await db.all('questions');return {count:qs.length,ids:qs.map(q=>q.id),constraints:qs.filter(q=>q.answerConstraint==='fully_factored').length,schema:db.DB_VERSION,fix:await db.setting('questionBankFixVersion',0),keys:await caches.keys()};
  });
  assert.equal(runtime.count,bankCount);assert.equal(runtime.constraints,baseline.expectedFullyFactored);assert.equal(runtime.schema,fencing.dbVersion);assert.equal(runtime.fix,2);
  assert.deepEqual(runtime.ids,Array.from({length:bankCount},(_,i)=>`Q${String(i+1).padStart(4,'0')}`));
  const currentQuestions=await page.evaluate(async()=>(await(await import('/js/db.js')).all('questions')));
  assert.deepEqual(currentQuestions.slice(0,bankCount),beforeQuestions,'旧350条questions也逐字段不变');
  const newIds=Array.from({length:bankCount-bankCount},(_,i)=>'Q'+String(bankCount+i+1).padStart(4,'0'));
  const upgraded=await page.evaluate(async ids=>{
    const db=await import('/js/db.js'),{score}=await import('/js/scoring.js');
    for(const id of ids){const q=await db.get('questions',id);if(!q||!score(q,Array.isArray(q.answer)?q.answer:[q.answer]).correct)throw Error('新增题不可读/不可判 '+id);}
    return {ids,bankVersion:await db.setting('questionBankVersion'),mastered:(await db.get('wrongQuestions','Q0165')).mastered};
  },newIds);
  assert.equal(upgraded.bankVersion,baseline.expectedQuestionBankVersion);assert.equal(upgraded.mastered,true);
  report.upgrade350to360={oldQuestionsUnchanged:true,newQuestions:upgraded.ids,masteredPreserved:true};
  const freshContext=await browser.newContext({serviceWorkers:'allow'}),freshPage=await freshContext.newPage();track(freshPage);
  await freshPage.goto(origin+'/');await freshPage.locator('#start').waitFor();
  const fresh=await freshPage.evaluate(async ids=>{
    const db=await import('/js/db.js'),engine=await import('/js/questionEngine.js'),{score}=await import('/js/scoring.js');
    const questions=await db.all('questions'),task=await engine.getOrCreateToday(),same=await engine.getOrCreateToday();
    for(const id of ids){const q=await db.get('questions',id);if(!q||!score(q,Array.isArray(q.answer)?q.answer:[q.answer]).correct)throw Error('新用户新增题失败 '+id);}
    return {count:questions.length,taskCount:task.questionIds.length,same:JSON.stringify(task)===JSON.stringify(same),answers:(await db.all('answers')).length,checkins:(await db.all('checkins')).length};
  },newIds);
  assert.equal(fresh.count,bankCount);assert.equal(fresh.taskCount,10);assert.equal(fresh.same,true);assert.equal(fresh.answers,0);assert.equal(fresh.checkins,0);
  report.newUser={...fresh,newQuestionsReadableAndScorable:true};await freshContext.close();
  assert.ok(runtime.keys.includes('another-project-static-v1'));assert.ok(!runtime.keys.includes('grade7-math-v1'));assert.ok(runtime.keys.includes(safety.previousCache));
  const beforePreview=await snapshot(page);
  const preview=await context.newPage();track(preview);await preview.goto(origin+'/question-preview.html');
  await preview.waitForFunction(count=>document.querySelector('#preview-title')?.textContent===`${count} 题显示预览`,bankCount);
  assert.ok((await preview.locator('#summary').textContent()).includes(`已加载 ${bankCount} 题`));assert.equal(await preview.locator('article.preview').count(),bankCount);
  assert.equal(await preview.locator('#clear').count(),0);
  await preview.close();
  assert.deepEqual(await snapshot(page),beforePreview,'浏览题库后每个学习表的完整数据必须不变');
  for(const asset of releaseAssets){
    const name=asset==='./'?'index.html':asset.slice(2);
    const text=await page.evaluate(async ({asset,cache})=>{const response=await(await caches.open(cache)).match(asset);return response?response.text():null},{asset,cache:redirect.cache});
    assert.equal(text,read(name).toString(),asset+'必须缓存当前文件，不能混用旧资源');
  }
  Object.assign(report,{runtimeLoad:runtime,sameDayTaskPreserved:true,oldLearningStoresPreserved:true,localStoragePreserved:true,precacheEntries:releaseAssets.length});
  // A separate no-SW UI fixture proves the heading isn't hard-coded to 350.
  const titleContext=await browser.newContext({serviceWorkers:'block'}),titlePage=await titleContext.newPage();track(titlePage);
  await titlePage.route('**/data/questions.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(JSON.parse(read('data/questions.json')).slice(0,3))}));
  await titlePage.goto(origin+'/question-preview.html');
  await titlePage.waitForFunction(()=>document.querySelector('#preview-title')?.textContent==='3 题显示预览');
  assert.match(await titlePage.locator('#summary').textContent(),/已加载 3 题/);await titleContext.close();
  report.previewTitle={runtimeCount:bankCount,syntheticCount:3,dynamic:true};
  // Close the online page, turn networking off, and reopen the PWA. No API mocks.
  await context.setOffline(true);await page.close();page=await context.newPage();track(page);
  await page.goto(origin+'/',{waitUntil:'load'});await page.locator('#start').waitFor();
  assert.equal(await page.evaluate(()=>globalThis.MATH_PWA_VERSION.cacheVersion),redirect.cache);
  assert.equal(await page.evaluate(async()=>(await(await import('/js/db.js')).all('questions')).length),bankCount);
  const preservedRange=await page.evaluate(async()=>{const db=await import('/js/db.js'),engine=await import('/js/questionEngine.js');return {enabled:await engine.enabledPoints(),saved:await db.setting('enabledKnowledgePoints'),done:await db.setting('integratedPolynomialMulDivScopeIntroduced',false)}});
  assert.deepEqual(preservedRange.enabled,['相反数','绝对值']);assert.deepEqual(preservedRange.saved,preservedRange.enabled);assert.equal(preservedRange.done,true);
  assert.deepEqual((await snapshot(page)).dailyTasks,before.dailyTasks,'离线重开不能换题');
  const offlinePreview=await context.newPage();track(offlinePreview);await offlinePreview.goto(origin+'/question-preview.html');
  await offlinePreview.waitForFunction(count=>document.querySelector('#preview-title')?.textContent===`${count} 题显示预览`,bankCount);await offlinePreview.close();report.previewTitle.offlineCount=bankCount;
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
  const offlineAdded=await page.evaluate(async()=>{const db=await import('/js/db.js'),{score}=await import('/js/scoring.js');const ids=[];for(let n=361;n<=368;n++){const id=`Q${String(n).padStart(4,'0')}`,q=await db.get('questions',id);if(!q||!score(q,[q.answer]).correct)throw Error('离线新增题不可用 '+id);ids.push(id)}return ids});
  assert.equal(offlineAdded.length,8);
  report.offline={reopened:true,questions:bankCount,newQuestions:offlineAdded,newModulesLoaded:true,existingTaskContinued:true,scoringPassed:true,confirmationAndDraftPersisted:true};
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
    if(task.items.length!==10||exposure.length!==1||exposure[0].sourceType!=='review'||task.items.some(i=>i.sourceType==='weakness'&&newPoints.includes(i.targetKnowledgePoint))||task.items.filter(i=>i.sourceType==='wrong_review').length!==2)throw Error('真实题库零样本回归');
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
  // Fresh browser storage proves the visible rollover flow with real IndexedDB.
  // Four confirmed drafts survive midnight; the next screen resumes question5.
  const carryContext=await browser.newContext({viewport:{width:1024,height:768},timezoneId:'America/Los_Angeles',serviceWorkers:'block'});
  const carryPage=await carryContext.newPage();track(carryPage);
  await carryPage.clock.install({time:new Date('2026-10-22T19:00:00Z')});
  await carryPage.goto(origin+'/__setup__.html');
  const carrySeed=await carryPage.evaluate(async()=>{
    const db=await import('/js/db.js'),engine=await import('/js/questionEngine.js'),{freezeAttemptScoringPolicy}=await import('/js/scoringPolicy.js');
    await db.importQuestions();await db.saveSetting('questionBankFixVersion',2);
    const work=await engine.getDailyWorkload(),task=work.batches[0].task,questions=await engine.questionsFor(task);
    for(const q of questions.slice(0,4))await db.put('answers',{key:task.date+':'+q.id,date:task.date,questionId:q.id,draftSaved:true,currentInputs:Array.isArray(q.answer)?q.answer:[q.answer],...freezeAttemptScoringPolicy(task,q.id)});
    return {task,drafts:await db.all('answers'),nextAnswer:questions[4].answer};
  });
  await carryPage.goto(origin+'/');
  await carryPage.waitForFunction(()=>document.querySelector('#workload-remaining')?.textContent==='6 题');
  await carryPage.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'));
  await carryPage.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await carryPage.waitForFunction(()=>document.querySelector('#workload-remaining')?.textContent==='16 题');
  await carryPage.locator('#start').click();await carryPage.waitForFunction(()=>document.querySelector('[data-go="4"]')?.getAttribute('aria-current')==='step');
  const retained=await carryPage.evaluate(async()=>{
    const db=await import('/js/db.js');return {task:await db.get('dailyTasks','2026-10-22'),drafts:await db.all('answers')};
  });
  assert.deepEqual(retained.task.questionIds,carrySeed.task.questionIds);assert.deepEqual(retained.task.scoringQuestionPolicies,carrySeed.task.scoringQuestionPolicies);assert.deepEqual(retained.drafts,carrySeed.drafts);
  const input=Array.isArray(carrySeed.nextAnswer)?carrySeed.nextAnswer:[carrySeed.nextAnswer];
  for(let i=0;i<input.length;i++)await carryPage.locator(`[data-answer="${i}"]`).fill(input[i]);
  await carryPage.locator('#next').click();await carryPage.locator('.confirm-overlay #confirm').click();
  await carryPage.waitForFunction(()=>document.querySelector('[data-go="5"]')?.getAttribute('aria-current')==='step');
  assert.equal(await carryPage.evaluate(async()=>(await(await import('/js/questionEngine.js')).getDailyWorkload()).remaining),15);
  await carryPage.locator('[data-answer="0"]').fill('尚未暂存的答案');
  await carryPage.clock.setSystemTime(new Date('2026-10-24T19:00:00Z'));
  await carryPage.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))});
  await carryPage.clock.runFor(30001);
  assert.equal(await carryPage.locator('[data-answer="0"]').inputValue(),'尚未暂存的答案','跨日恢复不得重绘输入页');
  await carryPage.reload();
  await carryPage.waitForFunction(()=>document.querySelector('#workload-remaining')?.textContent==='25 题');
  const carried=await carryPage.evaluate(async()=>{
    const db=await import('/js/db.js');return {tasks:(await db.all('dailyTasks')).map(t=>({date:t.date,count:t.questionIds.length})),answers:(await db.all('answers')).length,checkins:(await db.all('checkins')).length};
  });
  assert.deepEqual(carried.tasks,[{date:'2026-10-22',count:10},{date:'2026-10-23',count:10},{date:'2026-10-24',count:10}]);assert.equal(carried.answers,5);assert.equal(carried.checkins,0);
  await carryPage.clock.setSystemTime(new Date('2026-10-25T19:00:00Z'));
  await carryPage.clock.runFor(30001);
  await carryPage.waitForFunction(()=>document.querySelector('#workload-remaining')?.textContent==='35 题');
  report.carryoverUI={partialFourThenSixPlusTen:true,resumesAtQuestionFive:true,retainedDraftsAndPolicy:true,confirmationBeforeNext:true,thirdDayRemaining25AfterFiveDrafts:true,noFakeCheckin:true,overnightFocusRefresh:true,timerRolloverRefresh:true,unsavedInputSurvivesRollover:true};
  await carryContext.close();
  const scopeContext=await browser.newContext({serviceWorkers:'block'});
  const scopePage=await scopeContext.newPage();track(scopePage);
  await scopePage.goto(origin+'/');await scopePage.locator('#start').waitFor();
  await scopePage.evaluate(async()=>{
    const db=await import('/js/db.js'),engine=await import('/js/questionEngine.js'),date=engine.today();
    const task=await db.get('dailyTasks',date);
    await db.put('dailyTasks',{...task,questionIds:task.questionIds.slice(0,1)});
    await db.saveSetting('enabledKnowledgePoints',['幂的乘方']);
  });
  await scopePage.reload();await scopePage.locator('#adjust-scope').click();
  assert.match(await scopePage.locator('#scope-status').textContent(),/可用 1 道正式题.*还差 9 道/);
  assert.equal(await scopePage.locator('#save-settings').isDisabled(),true);
  await scopePage.locator('input[value="相反数"]').check();
  assert.match(await scopePage.locator('#scope-status').textContent(),/满足每日 10 题要求/);
  await scopePage.locator('#save-settings').click();await scopePage.locator('#start').waitFor();
  const repair=await scopePage.evaluate(async()=>{
    const db=await import('/js/db.js'),engine=await import('/js/questionEngine.js'),date=engine.today();
    const task=await db.get('dailyTasks',date);
    const questionId=task.questionIds[0];
    await db.put('dailyTasks',{...task,questionIds:[questionId]});
    await db.put('answers',{key:date+':'+questionId,date,questionId,draftSaved:true,currentInputs:['历史草稿']});
    return {count:task.questionIds.length,saved:await engine.enabledPoints()};
  });
  assert.deepEqual(repair,{count:10,saved:['相反数','幂的乘方']});
  const protectedBefore=await snapshot(scopePage);
  await scopePage.reload();await scopePage.locator('#open-backup').waitFor();
  assert.match(await scopePage.locator('#protected-task-warning').textContent(),/人工核查/);
  assert.deepEqual(await snapshot(scopePage),protectedBefore);
  await scopePage.locator('#open-backup').click();await scopePage.locator('#export').waitFor();
  await scopeContext.close();
  report.scopeRecovery={insufficientRangeBlocked:true,explicitSelectionPreserved:true,unusedTaskRepaired:true,protectedDraftPreserved:true};

  // Verify the actual parent UI using a fresh device with a valid generated task.
  stage='new';
  const updateContext=await browser.newContext({serviceWorkers:'allow'});
  let main=await updateContext.newPage();track(main);
  await main.goto(origin+'/');await main.locator('#start').waitFor();
  await main.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await main.reload();await main.locator('#start').waitFor();
  const parent=await updateContext.newPage();track(parent);
  await parent.goto(origin+'/parent.html');
  const downloadEvent=parent.waitForEvent('download');await parent.locator('#export').click();
  const downloaded=await downloadEvent;
  const backupData=JSON.parse(fs.readFileSync(await downloaded.path(),'utf8'));
  await parent.locator('#export').waitFor();
  await main.evaluate(async()=>{const db=await import('/js/db.js');await db.saveSetting('browser-regression-marker','before restore')});
  const beforeRestore=await snapshot(main);
  const backupUpload={name:'fixture-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backupData))};
  const recoveryDialog=parent.waitForEvent('dialog').then(dialog=>{assert.match(dialog.message(),/已恢复并核验/);return dialog.accept()});
  await parent.locator('#backup-file').setInputFiles(backupUpload);
  await parent.locator('#confirm-restore').click();await recoveryDialog;
  await parent.locator('#restore-point').waitFor();
  assert.deepEqual(await snapshot(parent),backupData.stores);
  const staleWrite=await main.evaluate(async()=>{
    try{await(await import('/js/db.js')).saveSetting('stale-write','must not persist');return false}catch{return true}
  });
  assert.equal(staleWrite,true);
  await main.locator('#learning-data-stale').waitFor();
  await main.close();
  const rollbackDialog=parent.waitForEvent('dialog').then(dialog=>{assert.match(dialog.message(),/已恢复并核验/);return dialog.accept()});
  await parent.locator('#restore-point').click();await parent.locator('#confirm-restore').click();await rollbackDialog;
  await parent.locator('#export-point').waitFor();
  assert.deepEqual(await snapshot(parent),beforeRestore);
  main=await updateContext.newPage();track(main);
  await main.goto(origin+'/');await main.locator('#start').waitFor();
  await parent.close();
  report.nativeBackup={export:true,restore:true,rollbackExactContents:true,activePracticeTabStaleWriteRejected:true};

  // Real update: failed precache, two active tabs, then a safe explicit update.
  const busy=await updateContext.newPage();track(busy);
  await busy.goto(origin+'/');await busy.locator('#start').click();
  await busy.locator('[data-answer="0"]').fill('双标签页的未暂存输入');
  stage='broken';
  await main.evaluate(async()=>{
    const registration=await navigator.serviceWorker.getRegistration();
    const failure=new Promise(resolve=>registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker.addEventListener('statechange',()=>{if(worker.state==='redundant')resolve()});
    },{once:true}));
    await registration.update();await failure;
  });
  assert.equal(await main.evaluate(()=>globalThis.MATH_PWA_VERSION.cacheVersion),redirect.cache);
  assert.equal(await busy.locator('[data-answer="0"]').inputValue(),'双标签页的未暂存输入');
  stage='forward';
  await main.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update()});
  await main.locator('#app-update[data-state="ready"]').waitFor();
  await busy.locator('#app-update[data-state="waiting"]').waitFor();
  assert.equal(await busy.locator('#app-update button').isDisabled(),true);
  await main.locator('#app-update button').click();
  await main.waitForFunction(()=>document.querySelector('#app-update')?.textContent.includes('关闭所有数学打卡页面'));
  assert.equal(await busy.locator('[data-answer="0"]').inputValue(),'双标签页的未暂存输入');
  await busy.locator('#save-home').click();await busy.locator('.confirm-overlay #confirm').click();
  await busy.locator('#start').waitFor();
  const beforeForward=await snapshot(main);
  assert.ok(beforeForward.answers.some(answer=>answer.currentInputs?.includes('双标签页的未暂存输入')));
  await busy.close();
  await main.locator('#app-update button').click();
  assert.equal(await main.evaluate(()=>globalThis.MATH_PWA_VERSION.cacheVersion),redirect.cache);
  await main.close();
  await new Promise(resolve=>setTimeout(resolve,800));
  main=await updateContext.newPage();track(main);await main.goto(origin+'/');
  await main.waitForFunction(()=>globalThis.MATH_PWA_VERSION?.cacheVersion==='grade7-math-v38'&&document.querySelector('#start'));
  assert.deepEqual(await snapshot(main),beforeForward);
  await updateContext.setOffline(true);
  await main.reload();await main.locator('#start').waitFor();
  assert.equal(await main.evaluate(()=>globalThis.MATH_PWA_VERSION.cacheVersion),'grade7-math-v38');
  await updateContext.setOffline(false);

  // Advance through native submit/correction UI with an update in waiting.
  await main.evaluate(async()=>{
    const db=await import('/js/db.js'),engine=await import('/js/questionEngine.js'),policy=await import('/js/scoringPolicy.js');
    const task=await engine.getOrCreateToday(),questions=await engine.questionsFor(task);
    for(const [index,question] of questions.entries()){
      const currentInputs=index?(Array.isArray(question.answer)?question.answer:[question.answer]):[];
      await db.put('answers',{key:task.date+':'+question.id,date:task.date,questionId:question.id,
        currentInputs,gaveUp:!index,draftSaved:true,...policy.freezeAttemptScoringPolicy(task,question.id)});
    }
  });
  await main.reload();await main.locator('#start').click();await main.locator('#final-submit').waitFor();
  stage='correction';
  await main.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update()});
  await main.locator('#app-update[data-state="waiting"]').waitFor();
  await main.locator('#final-submit').click();await main.locator('#correct').click();
  await main.locator('[data-answer="0"]').fill('订正草稿');
  assert.equal(await main.locator('#app-update button').isDisabled(),true);
  assert.equal(await main.locator('[data-answer="0"]').inputValue(),'订正草稿');
  await main.locator('#correction-home').click();await main.locator('.confirm-overlay #confirm').click();
  await main.locator('#app-update[data-state="ready"]').waitFor();
  assert.ok((await snapshot(main)).answers.some(answer=>answer.correctionInputs?.includes('订正草稿')));
  await updateContext.close();
  report.forwardUpdate={failedDownloadOldVersionUsable:true,multipleTabsNoForcedReload:true,draftAndTaskPreserved:true,naturalActivationAfterClosingClients:true,offlineBoot:true,submittingAndCorrectingProtected:true};
  assert.deepEqual(errors,[],'不能存在JS运行时错误');report.pageErrors=errors;report.result='PASS';
  if(process.env.PWA_TEST_REPORT)fs.writeFileSync(process.env.PWA_TEST_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log('PWA browser release PASS: authentic v34 -> v37, protected input, unchanged learning data and scope, read-only preview, offline practice, and real carryover UI.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
