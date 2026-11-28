import {openDB,all,dataSafetyStatus,DB_VERSION,importQuestions} from './db.js';import {summarizeKnowledge,summarizeTaskOutcomes,originalAttemptState} from './statistics.js';import {exportBackup,importBackup,validateBackup,readRestoreSnapshot,rollbackRestoreSnapshot} from './backup.js';import {initPwaUpdates,showUpdateSuccess} from './updateManager.js';
import {ALL_KNOWLEDGE_POINTS,knowledgePointName} from './knowledgePoints.js';
import {enabledPoints,inspectLearningScope,saveLearningScope,getQuestionTypeMix,saveQuestionTypeMix,questionTrainingType} from './questionEngine.js';
import {calculateCoverage} from './coverage.js';
import {formatMath,questionText} from './formatMath.js';
const app=document.querySelector('#app'),config=globalThis.MATH_PWA_VERSION||{appVersion:'dev',questionBankVersion:'dev'},points=ALL_KNOWLEDGE_POINTS,labels={insufficient_data:'样本不足',mastered:'已掌握',mostly_mastered:'基本掌握',weak:'需要加强',priority_weak:'重点加强'};
globalThis.addEventListener('learning-data-stale',()=>{
  protectUpdate('学习数据已发生变化，请重新载入。');
  if(document.querySelector('#learning-data-stale'))return;
  const notice=document.createElement('section');
  notice.id='learning-data-stale';notice.className='confirm-overlay';notice.setAttribute('role','alert');
  notice.innerHTML='<div class="confirm-panel"><h2>学习数据已恢复或变更</h2><p>当前页面不能继续保存旧数据，请重新载入。</p><button type="button">重新载入</button></div>';
  notice.querySelector('button').onclick=()=>location.reload();document.body.append(notice);
});
let updateReason='正在读取家长模式数据。',refreshPwaUpdates;
function protectUpdate(reason){updateReason=reason;refreshPwaUpdates?.()}
const attempts=s=>(s.last20Attempts?.length?s.last20Attempts:(s.recentAttempts||[]).map(x=>typeof x==='boolean'?x:x.firstCorrect)).slice(-20),chart=s=>{const a=attempts(s),accuracy=Math.round(s.recentAccuracy||0);return `<div class="chart"><div class="chart-head"><span>最近正确率</span><b>${s.attempts?`${accuracy}%`:'—'}</b></div><div class="accuracy-track"><i style="width:${accuracy}%"></i></div><div class="chart-head small"><span>最近 ${a.length||0} 次首次作答</span><span>绿=正确 · 红=错误</span></div>${a.length?`<div class="attempt-dots">${a.map(v=>`<i class="${v?'correct':'wrong'}"></i>`).join('')}</div>`:'<div class="chart-empty">尚无作答数据</div>'}</div>`};
const backupText=time=>{if(!time)return '尚未完整备份';const days=Math.floor((Date.now()-new Date(time))/86400000);return `${new Date(time).toLocaleString('zh-CN')}${days>7?` · 已 ${days} 天未备份，建议导出完整备份。`:''}`};
function download(data){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=`math-learning-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function render(){protectUpdate('正在读取家长模式数据。');
  const [stats,enabled,safety,bank,recovery,answers,history,tasks,typeMix]=await Promise.all([
    all('knowledgeStats'),enabledPoints(),dataSafetyStatus(),all('questions'),
    readRestoreSnapshot().then(snapshot=>({snapshot,available:true}),()=>({snapshot:null,available:false})),
    all('answers'),all('questionHistory'),all('dailyTasks'),getQuestionTypeMix()
  ]);
  const map=new Map(stats.map(s=>[s.knowledgePoint,s])),state=safety.migration?.ok===false?'迁移异常：请停止操作并保留备份':'正常';app.innerHTML=`<div class="shell"><section class="card result"><p class="eyebrow">家长模式</p><h1 class="title">弱项与学习范围</h1><section class="answer-key parent-card"><b>更新安全状态</b><div class="small">应用版本：v${config.appVersion}<br>题库版本：${safety.questionBankVersion||config.questionBankVersion}<br>数据库版本：${DB_VERSION}<br>最近完整备份：${backupText(safety.lastBackupAt)}<br>数据状态：${state}<br>学习记录：答题 ${safety.counts.answers||0} · 打卡 ${safety.counts.checkins||0} · 错题 ${safety.counts.wrongQuestions||0} · 任务 ${safety.counts.dailyTasks||0}</div><div class="actions"><button id="export">导出完整备份</button><button class="secondary" id="restore">导入备份（完整恢复）</button><input id="backup-file" type="file" accept="application/json" hidden></div>${recovery.snapshot?'<div class="actions"><button class="secondary" id="export-point">导出恢复前快照</button><button class="secondary" id="restore-point">回退到恢复前快照</button></div>':recovery.available?'':'<p class="small" role="status">暂时无法读取本机恢复前快照。</p>'}</section><p class="subtle">柱状图为最近 20 次首次作答正确率；点阵从左到右表示最近作答顺序。</p><div class="parent-stats">${points.map(k=>{const s=summarizeKnowledge(map.get(k)||{knowledgePoint:k});return `<article class="answer-key parent-card"><div class="parent-title"><b>${esc(knowledgePointName(k))}</b><span class="state ${s.state}">${labels[s.state]}</span></div>${chart(s)}<div class="small">总作答次数：${s.attempts} · 连续错误：${s.consecutiveWrong}</div></article>`}).join('')}</div><details class="answer-key parent-disclosure" id="scope-disclosure"><summary>当前学习范围</summary><div class="answer-area">${points.map(p=>`<label><input type="checkbox" value="${p}" ${enabled.includes(p)?'checked':''}> ${esc(knowledgePointName(p))}</label>`).join('')}</div><div class="actions"><p id="parent-scope-status" class="subtle" role="status"></p><button id="save">保存学习范围</button></div></details><div class="actions"><button class="secondary" id="back">返回练习</button></div></section></div>`;
  const pending=answers.filter(row=>row.manualCheck&&row.firstAttemptCorrect===null&&!row.unanswered);
  if(pending.length){const panel=document.createElement('section');panel.className='answer-key parent-card';const byId=new Map(bank.map(question=>[question.id,question]));panel.innerHTML=`<h2>待人工确认</h2><p>以下答案暂不计入正确率或错题统计，可返回练习查看并确认。</p><ul>${pending.map(row=>`<li>${esc(row.date)} · ${esc(knowledgePointName(byId.get(row.questionId)?.knowledgePoint||''))} · ${formatMath(questionText(byId.get(row.questionId)))}</li>`).join('')}</ul>`;app.querySelector('.parent-stats').before(panel)}
  const coverage=calculateCoverage({questions:bank,answers,history,tasks,enabled,stats});
  const mixPanel=document.createElement('section');mixPanel.className='answer-key parent-card';
  const scoped=bank.filter(q=>enabled.includes(q.knowledgePoint));
  const choiceStock=scoped.filter(q=>questionTrainingType(q)==='choice').length;
  mixPanel.innerHTML=`<h2>每日题型目标</h2><p>每日固定 10 题；选择题与基础输入型兼容分类。比例是目标，库存或复习规则不足时自动补位，已生成任务不变。</p><label>选择题目标 <input id="choice-target" type="number" min="0" max="10" step="1" value="${typeMix.choice}"></label> <span id="input-target"></span><p>当前范围库存：选择题 ${choiceStock} 道 · 输入型 ${scoped.length-choiceStock} 道</p><div class="actions"><button id="save-mix">保存题型目标</button><button id="reset-mix" class="secondary">恢复默认</button></div><p id="mix-status" role="status"></p>`;
  app.querySelector('.parent-stats').before(mixPanel);
  const choiceTarget=mixPanel.querySelector('#choice-target'),mixStatus=mixPanel.querySelector('#mix-status');
  const showMix=()=>{const n=Number(choiceTarget.value),valid=choiceTarget.value!==''&&Number.isInteger(n)&&n>=0&&n<=10;mixPanel.querySelector('#input-target').textContent=valid?`输入型目标 ${10-n} 道`: '请输入 0 至 10 的整数';mixPanel.querySelector('#save-mix').disabled=!valid;if(valid)mixStatus.textContent=choiceStock<n||scoped.length-choiceStock<10-n?'当前库存不足目标，实际选题将按规则补位。':''};
  choiceTarget.oninput=showMix;mixPanel.querySelector('#reset-mix').onclick=()=>{choiceTarget.value='2';showMix()};
  mixPanel.querySelector('#save-mix').onclick=async()=>{await saveQuestionTypeMix({choice:Number(choiceTarget.value)});mixStatus.textContent='已保存，仅影响尚未生成的任务。'};showMix();
  const taskPanel=document.createElement('details');taskPanel.className='answer-key parent-disclosure';
  const taskRows=tasks.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(task=>{const s=summarizeTaskOutcomes(task,answers),rate=(n,empty)=>n===null?empty:`${(n*100).toFixed(1)}%`;return `<details><summary>${esc(task.date)} · ${s.submitted?'已提交':'未提交'} · ${s.processing}</summary><p>全组首答正确比例 ${rate(s.firstGroupRate,'历史数据不可用')}（${s.correct}/${s.total}） · 已判分题正确率 ${rate(s.judgedAccuracy,'暂无有效判分')}</p><p>首次正确 ${s.correct} · 首次错误 ${s.wrong} · 未作答 ${s.unanswered} · 无效输入 ${s.invalid} · 系统待人工确认 ${s.manual}${s.unavailable?` · 历史数据不可用 ${s.unavailable}`:''}</p><p>当前待订正 ${s.pendingCorrection} · 当前待人工确认 ${s.pendingManual} · 当前有效判定正确 ${s.effectiveCorrect}、错误 ${s.effectiveWrong}</p></details>`}).join('');
  taskPanel.innerHTML=`<summary>任务首次作答统计</summary><p>首次状态保留原始事实；家长确认后的当前有效判定另列。</p>${taskRows||'<p>暂无任务记录。</p>'}`;app.querySelector('.parent-stats').before(taskPanel);
  const typePanel=document.createElement('section');typePanel.className='answer-key parent-card';
  const byQuestion=new Map(bank.map(q=>[q.id,q]));
  const typeRows=['choice','input'].map(type=>{const pool=bank.filter(q=>questionTrainingType(q)===type),ids=new Set(pool.map(q=>q.id)),records=answers.filter(r=>ids.has(r.questionId)),done=new Set(records.filter(r=>originalAttemptState(r)!=='unanswered').map(r=>r.questionId)),states=records.map(originalAttemptState),correct=states.filter(x=>x==='correct').length,wrong=states.filter(x=>x==='wrong').length,manual=records.filter(r=>r.manualCheck&&r.firstAttemptCorrect===null&&!r.manualResolved).length;return `<p>${type==='choice'?'选择题':'基础输入型'}：总计 ${pool.length} · 已刷 ${done.size} · 未刷 ${pool.length-done.size} · 已判分正确率 ${correct+wrong?`${(100*correct/(correct+wrong)).toFixed(1)}%`:'暂无有效判分'} · 当前待人工确认 ${manual}</p>`}).join('');
  typePanel.innerHTML=`<h2>按题型统计</h2>${typeRows}`;app.querySelector('.parent-stats').before(typePanel);
  // Include empty points so parents can see why a scope cannot supply a task.
  const represented=new Set(coverage.rows.map(row=>row.knowledgePoint));
  for(const point of points)if(!represented.has(point))coverage.rows.push({knowledgePoint:point,total:0,done:0,remaining:0,rate:0,unseen:[],attempts:0,lastDate:null,enabled:enabled.includes(point),stat:map.get(point)});
  const pct=n=>`${(n*100).toFixed(1)}%`;
  const panel=document.createElement('details');panel.className='answer-key parent-disclosure';
  panel.innerHTML=`<summary>题库覆盖情况</summary><p>全部 ${coverage.total} 题 · 已安排 ${coverage.scheduled} · 已刷 ${coverage.done} · 未刷 ${coverage.remaining}</p><div class="accuracy-track"><i style="width:${pct(coverage.rate)}"></i></div><p>覆盖率 ${pct(coverage.rate)} · 正式作答 ${coverage.attempts} 次 · 重复作答 ${coverage.repeats} 次（${pct(coverage.repeatRate)}）</p><p>当前学习范围：${coverage.scopedTotal} 题 · 已刷 ${coverage.scopedDone} · 未刷 ${coverage.scopedRemaining} · 覆盖率 ${pct(coverage.scopedRate)}</p><label>筛选 <select id="coverage-filter"><option value="all">全部知识点</option><option value="enabled">当前学习范围</option><option value="remaining">存在未刷题目</option><option value="complete">首轮覆盖完成</option></select></label> <label>排序 <select id="coverage-sort"><option value="remaining">未刷题数</option><option value="rate">覆盖率从低到高</option><option value="original">知识点原有顺序</option></select></label><div id="coverage-rows"></div>`;
  app.querySelector('.parent-stats').before(panel);
  const rows=panel.querySelector('#coverage-rows');
  function renderCoverage(){const filter=panel.querySelector('#coverage-filter').value,sort=panel.querySelector('#coverage-sort').value;
    let list=coverage.rows.filter(r=>filter==='all'||filter==='enabled'&&r.enabled||filter==='remaining'&&r.remaining>0||filter==='complete'&&r.total>0&&r.remaining===0);
    if(sort==='remaining')list.sort((a,b)=>b.remaining-a.remaining);else if(sort==='rate')list.sort((a,b)=>a.rate-b.rate);
    rows.innerHTML=list.map(r=>{const records=answers.filter(a=>byQuestion.get(a.questionId)?.knowledgePoint===r.knowledgePoint),states=records.map(originalAttemptState),correct=states.filter(s=>s==='correct').length,wrong=states.filter(s=>s==='wrong').length,pending=records.filter(a=>a.manualCheck&&a.firstAttemptCorrect===null&&!a.manualResolved).length;return `<details><summary>${esc(knowledgePointName(r.knowledgePoint))} · 已刷 ${r.done}/${r.total} · 未刷 ${r.remaining} · ${pct(r.rate)}</summary><div class="accuracy-track"><i style="width:${pct(r.rate)}"></i></div><p>库存 ${r.total} 题 · ${r.total>=10?'可单独提供 10 道不同题目':'不足 10 道，不能单独组成每日任务'}</p><p>首次已判分正确率 ${correct+wrong?`${(100*correct/(correct+wrong)).toFixed(1)}%`:'暂无有效判分'} · 当前待人工确认 ${pending}</p><p>正式作答 ${r.attempts} 次 · 最近 ${esc(r.lastDate||'—')} · ${r.enabled?'已启用':'未启用'} · ${esc(labels[summarizeKnowledge(r.stat||{knowledgePoint:r.knowledgePoint}).state])}</p>${r.unseen.length?`<ul>${r.unseen.map(q=>`<li>${esc(q.id)} · ${formatMath(questionText(q))} · ${esc(q.subKnowledgePoint||'—')} · 难度 ${esc(q.difficulty||'—')}${q.scheduled?' · 已安排待作答':''}</li>`).join('')}</ul>`:'<p>暂无未刷题目</p>'}</details>`}).join('')||'<p>没有符合条件的知识点。</p>';
  }
  panel.querySelector('#coverage-filter').onchange=renderCoverage;panel.querySelector('#coverage-sort').onchange=renderCoverage;renderCoverage();
  if(safety.migration?.ok!==false)await showUpdateSuccess();
  const fileInput=document.querySelector('#backup-file');
  const status=document.querySelector('#parent-scope-status');
  const saveButton=document.querySelector('#save');
  const selected=()=>[...app.querySelectorAll('input:checked')].map(input=>input.value);
  const refreshScope=()=>{
    const state=inspectLearningScope(bank,selected());
    status.textContent=`已选 ${state.selectedCount} 个知识点 · 可用 ${state.eligibleCount} 道正式题 · ${state.valid?'满足每日 10 题要求':`还差 ${state.missingCount} 道，无法保存`}`;
    saveButton.disabled=!state.valid;
  };
  for(const input of app.querySelectorAll('input[type=checkbox]'))input.addEventListener('change',()=>{
    protectUpdate('请先保存学习范围，或返回练习。');
    refreshScope();
  });
  refreshScope();
  saveButton.onclick=async()=>{
    saveButton.disabled=true;
    protectUpdate('正在保存学习范围。');
    try{
      await saveLearningScope(selected());
      refreshScope();
      status.textContent+='。已保存，用于尚未生成的每日任务。';
      protectUpdate('');
    }catch(error){
      refreshScope();
      status.textContent+=`。${error.message}`;
      protectUpdate('请先完成学习范围设置，或返回练习。');
    }
  };
  document.querySelector('#export').onclick=async()=>{
    protectUpdate('正在导出备份。');
    try{download(await exportBackup());await render()}
    catch(error){alert(`备份导出失败：${error.message}`);protectUpdate('')}
  };
  document.querySelector('#restore').onclick=()=>fileInput.click();
  fileInput.onchange=async event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    protectUpdate('正在检查备份，请先完成或取消恢复。');
    try{
      const data=JSON.parse(await file.text());
      renderPreview(validateBackup(data),()=>importBackup(data),'恢复备份');
    }catch(error){
      alert(`备份导入失败：${error.message}`);
      event.target.value='';
      protectUpdate('');
    }
  };
  if(recovery.snapshot){
    const {restoreSnapshotId,...data}=recovery.snapshot;
    document.querySelector('#export-point').onclick=()=>download(data);
    document.querySelector('#restore-point').onclick=()=>renderPreview({
      ...data,stats:Object.fromEntries(Object.entries(data.stores).map(([name,rows])=>[name,rows.length]))
    },()=>rollbackRestoreSnapshot(recovery.snapshot),'回退到本机快照');
  }
  document.querySelector('#back').onclick=()=>location.href='./';
  protectUpdate('');
}
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function renderPreview(meta,restore,label){
  protectUpdate('请先完成或取消恢复。');
  const list=Object.entries(meta.stats).map(([store,count])=>`${esc(store)}：${count}`).join('<br>');
  app.innerHTML=`<div class="shell"><section class="card result"><h1 class="title">确认${esc(label)}</h1><p class="subtle">恢复将完整替换本机学习记录。请先保存并关闭其他数学打卡练习页。覆盖前会保存并核验独立快照，供回退使用。</p><div class="answer-key"><p><b>备份时间：</b>${esc(new Date(meta.createdAt).toLocaleString('zh-CN'))}</p><p><b>应用版本：</b>${esc(meta.appVersion)}</p><p><b>备份格式版本：</b>${meta.backupVersion}</p><br><b>包含记录数：</b><br>${list}</div><div class="actions"><button id="confirm-restore" class="warning">确认${esc(label)}</button><button id="cancel-restore" class="secondary">取消</button></div></section></div>`;
  const confirm=document.querySelector('#confirm-restore'),cancel=document.querySelector('#cancel-restore');
  cancel.onclick=render;
  confirm.onclick=async()=>{
    confirm.disabled=true;cancel.disabled=true;confirm.textContent='恢复中…';
    protectUpdate('正在恢复学习记录，请等待核验完成。');
    try{await restore();alert('学习记录已恢复并核验，页面将重新载入。');location.reload();return}
    catch(error){alert(`恢复未能完成核验：${error.message}`)}
    await render();
  };
}
async function boot(){
  try{await openDB();if(!(await all('questions')).length)await importQuestions();await render()}
  catch(error){
    app.innerHTML=`<div class="shell"><section class="card"><h1>暂时无法读取学习统计</h1><p class="subtle">${esc(error.message)}</p><button onclick="location.reload()">重试</button></section></div>`;
    protectUpdate('请先重新读取学习记录。');
  }
  refreshPwaUpdates=initPwaUpdates({getBlockReason:()=>updateReason});
}
boot();
