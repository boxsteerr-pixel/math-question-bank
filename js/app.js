import {importQuestions,get,put,all,openDB,setting,runQuestionBankFixMigration,LEARNING_SESSION_LOCK,dataSafetyStatus} from './db.js';
import {today,getOrCreateToday,getDailyWorkload,CARRYOVER_START_SETTING,questionsFor,enabledPoints,inspectLearningScope,saveLearningScope} from './questionEngine.js';
import {scoreForFrozenPolicy} from './scoring.js';
import {isSingleChoice,validateChoice,optionOrder} from './choice.js';
import {parseRational} from './rationalExpression.js';
import {freezeAttemptScoringPolicy} from './scoringPolicy.js';
import {recordWrong,recordReviewCorrect} from './wrongQuestions.js';
import {ALL_KNOWLEDGE_POINTS,knowledgePointName} from './knowledgePoints.js';
import {updateKnowledge} from './statistics.js';
import {formatMath,normalizeMathInput,displayClass} from './formatMath.js';
import {initPwaUpdates,showUpdateSuccess} from './updateManager.js';
import {initialAttemptPolicy,currentFirstCorrect as firstAttemptState,summarizeFirstAttempts,nextAttemptCount} from './attemptPolicy.js';

const app=document.querySelector('#app');let task,questions,date,workload,activeMathInput=null,lastMathSelection=0,timerId,actionBusy=false;
globalThis.addEventListener?.('learning-data-stale',()=>{
  if(document.querySelector('#learning-data-stale'))return;
  const notice=document.createElement('section');
  notice.id='learning-data-stale';
  notice.setAttribute('role','alert');
  notice.className='confirm-overlay';
  notice.innerHTML='<div class="confirm-panel"><h2>学习数据已恢复或变更</h2><p>当前页面的旧内容不能再保存。请先复制需要保留的输入，再重新载入。</p><button type="button">重新载入</button></div>';
  const inputs=[...document.querySelectorAll('[data-answer]')].map(input=>input.value).filter(Boolean);
  if(inputs.length){const preserved=document.createElement('textarea');preserved.readOnly=true;preserved.value=inputs.join('\n');notice.firstElementChild.insertBefore(preserved,notice.querySelector('button'))}
  notice.querySelector('button').onclick=()=>location.reload();
  document.body.append(notice);
});
let homeDate=null,rolloverTimer=null,screen='loading',dirtyInput=false,operation='',refreshPwaUpdates;
const updateBlockReason=()=>operation||(dirtyInput?'请先暂存正在输入的答案。':screen==='practice'?'请先返回任务首页。':screen==='correction'?'请先暂存并退出订正。':['home','recovery'].includes(screen)?'':'请先完成当前操作并返回首页。');
function setScreen(value){screen=value;dirtyInput=false;refreshPwaUpdates?.()}
function markDirty(){dirtyInput=true;refreshPwaUpdates?.()}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qAnswer=q=>Array.isArray(q.answer)?q.answer.join('；'):q.answer;
function displayAnswer(q,values){
  if(!isSingleChoice(q))return (values||[]).filter(Boolean).join('；')||'不会 / 未作答';
  const id=values?.[0];if(!id)return '不会 / 未作答';
  const options=task.choiceOptionSnapshots?.[q.id]||q.options||[],order=task.choiceOptionOrders?.[q.id]||options.map(option=>option.id),index=order.indexOf(id),option=options.find(item=>item.id===id);
  return index<0||!option?'选项记录不可用':String.fromCharCode(65+index)+'. '+option.text;
}
/* Display-only compatibility recheck for records created before harmless format normalization. It never rewrites history or statistics. */
const currentFirstCorrect=(q,r)=>firstAttemptState(q,r,(question,values)=>scoreForFrozenPolicy(question,values,r).correct===true);
const answers=async()=> (await all('answers')).filter(x=>x.date===date);
const record=q=>get('answers',`${date}:${q.id}`);
const newAttempt=(q,fields)=>({...fields,...freezeAttemptScoringPolicy(task,q.id)});
const isInitialSubmitted=r=>Boolean(r?.initialSubmitted||r?.resolved||r?.firstAttemptCorrect!==undefined||r?.firstAnswer!==undefined);
const needsCorrection=r=>isInitialSubmitted(r)&&(r?.firstAttemptCorrect===null&&!r.unanswered&&!r.invalidInput&&!r.manualResolved||(r?.firstAttemptCorrect===false&&!r.resolved));
const isFinalStage=()=>['review','correction','complete'].includes(task.phase);
const duration=ms=>{const s=Math.max(0,Math.floor(ms/1000)),m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
const previousDate=date=>new Date(Date.UTC(...date.split('-').map((value,index)=>Number(value)-(index===1?1:0)))-86400000).toISOString().slice(0,10);
const checkinStreak=(checkins,from=today())=>{const dates=new Set(checkins.map(item=>item.date));let cursor=from,total=0;while(dates.has(cursor)){total++;cursor=previousDate(cursor)}return total};
function shell(html){homeDate=null;clearInterval(timerId);timerId=null;app.innerHTML=`<div class="shell">${html}</div>`}
async function saveTask(){await put('dailyTasks',task)}
function startTimer(){const el=document.querySelector('#timer');if(!el||!task.startedAt||task.endedAt)return;const update=()=>el.textContent=`用时 ${duration(Date.now()-task.startedAt)}`;update();timerId=setInterval(update,1000)}
function inputsFor(q,old){
  if(isSingleChoice(q)){
    if(!validateChoice(q))return '<p role="alert">选择题数据不完整，请联系家长核查。</p>';
    const options=task.choiceOptionSnapshots?.[q.id]||q.options,ids=task.choiceOptionOrders?.[q.id]||optionOrder(q,date),selected=old?.currentInputs?.[0]||'';
    return `<div class="choice-list" role="radiogroup" aria-label="选择答案"><input type="hidden" data-answer="0" value="${esc(selected)}">${ids.map((id,index)=>{const option=options.find(item=>item.id===id);return `<button type="button" class="choice-option ${selected===id?'selected':''}" role="radio" aria-checked="${selected===id}" data-choice="${esc(id)}"><span>${String.fromCharCode(65+index)}.</span><span>${formatMath(option.text)}</span></button>`}).join('')}</div>`;
  }
  const count=['multiple_blank','rational_multiple_blank'].includes(q.answerType)?(Array.isArray(q.answer)?q.answer.length:1):1;return Array.from({length:count},(_,i)=>`<input data-answer="${i}" inputmode="text" autocomplete="off" value="${esc(old?.currentInputs?.[i]||'')}" placeholder="答案${count>1?` ${i+1}`:''}">`).join('')
}
function bindChoices(){document.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{const input=document.querySelector('[data-answer]');input.value=button.dataset.choice;document.querySelectorAll('[data-choice]').forEach(item=>{const selected=item===button;item.classList.toggle('selected',selected);item.setAttribute('aria-checked',String(selected))});markDirty()}))}
function choiceFeedback(q,r){
  if(!isSingleChoice(q)||!validateChoice(q))return '';
  const options=task.choiceOptionSnapshots?.[q.id]||q.options,ids=task.choiceOptionOrders?.[q.id]||optionOrder(q,date),selected=r?.firstAnswer?.[0];
  return `<div class="choice-list">${ids.map((id,index)=>{const option=options.find(item=>item.id===id),correct=(r?.scoringQuestionPolicy?.correctOptionIds||q.correctOptionIds).includes(id);return `<div class="choice-option ${correct?'choice-correct':id===selected?'choice-wrong':''}"><span>${String.fromCharCode(65+index)}.</span><span>${formatMath(option.text)}${correct?' ✓':id===selected?' ✗':''}</span></div>`}).join('')}</div>${q.explanation?`<p>${formatMath(q.explanation)}</p>`:''}`;
}
function questionNav(index){return `<nav class="question-nav" aria-label="题目跳转">${questions.map((_,i)=>`<button type="button" data-go="${i}" class="${i===index?'active':''}" aria-current="${i===index?'step':'false'}">${i+1}</button>`).join('')}</nav>`}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function settledValues(){const inputs=[...document.querySelectorAll('[data-answer]')],deadline=Date.now()+900;while(Date.now()<deadline){const composing=inputs.some(input=>input.dataset.composing==='true'),latest=Math.max(0,...inputs.map(input=>Number(input.dataset.lastInputAt||0)));if(!composing&&Date.now()-latest>=120)break;await wait(25)}await wait(16);return inputs.map(input=>input.value.trim())}
function setActionDisabled(disabled){document.querySelectorAll('button').forEach(button=>{if(!button.closest?.('#app-update'))button.disabled=disabled})}
async function once(action,message='正在处理答题记录，请等待保存完成。'){
  if(actionBusy)return;
  actionBusy=true;operation=message;refreshPwaUpdates?.();setActionDisabled(true);
  try{return await action()}finally{actionBusy=false;operation='';setActionDisabled(false);refreshPwaUpdates?.()}
}
const workloadTarget=work=>work.batches.find(b=>b.needsSubmission)||work.batches.find(b=>b.corrections)||work.batches.at(-1);
async function startLatestBatch(){const current=await getDailyWorkload(),target=workloadTarget(current);return target?openBatch(target.date):home()}
async function refreshHomeForNewDay(){
  // Never replace an answer/settings/confirmation screen: unsaved input stays intact.
  if(!homeDate||homeDate===today()||document.hidden||actionBusy)return;
  return once(home);
}
function initDailyRollover(){
  if(rolloverTimer!==null)return;
  const check=()=>refreshHomeForNewDay().catch(error=>console.warn('跨日任务刷新失败，可稍后重试。',error));
  document.addEventListener('visibilitychange',check);
  globalThis.addEventListener?.('focus',check);globalThis.addEventListener?.('pageshow',check);
  rolloverTimer=setInterval(check,30000);
}

async function home(){
  try{workload=await getDailyWorkload()}catch(error){
    if(isScopeError(error)){showStartupError(error);return}
    throw error;
  }
  const checkins=await all('checkins'),pending=workload.batches.filter(b=>b.needsSubmission),target=pending[0]||workload.batches.find(b=>b.corrections)||workload.batches.at(-1);
  const label=pending.length?(target.remaining?`继续训练（待做${workload.remaining}题）`:'提交已暂存答案'):target?.corrections?'继续订正':'查看今日结果';
  const alerts=workload.anomalies.length?`<section class="answer-key" id="protected-task-warning"><b>部分历史任务需要人工核查</b>${workload.anomalies.map(item=>`<p class="small">${esc(item.message)}</p>`).join('')}${workload.anomalies.some(item=>item.blocksCheckin)?'<p class="small">仍可完成其他组。这些任务尚未核查，暂不能记为今日打卡。</p>':''}<button class="secondary" id="open-backup">前往家长模式备份</button></section>`:'';
  shell(`<section class="card"><p class="eyebrow">七年级数学</p><h1 class="title">每日计算打卡</h1><p class="subtle">${today()} · 每天新增10题，未做题顺延</p><div class="home-grid"><div class="metric">连续打卡<b>${checkinStreak(checkins)} 天</b></div><div class="metric">今日待做<b id="workload-remaining">${workload.remaining} 题</b></div><div class="metric">待提交组数<b>${pending.length} 组</b></div></div><p class="focus">历史补做 ${workload.carryRemaining} 题 ＋ 当天剩余 ${workload.newRemaining} 题</p><p class="subtle">已确认暂存的答案保留，不要求重做；仍需完成每组统一提交，才会判分。全部待提交组提交后，记为今天打卡，不补造过去的打卡记录。</p>${target?`<button class="primary-wide" id="start">${label}</button>`:''}${alerts}<section class="answer-list">${workload.batches.map(b=>`<article class="answer-key"><b>${b.isOverdue?'补做':'当天'} · ${b.date}</b><p class="small">${b.needsSubmission?(b.remaining?`待做 ${b.remaining} 题，已暂存 ${b.total-b.remaining} 题`:'答案已暂存，待统一提交'):b.corrections?`已提交，待订正/确认 ${b.corrections} 题`:'已提交'}（本组 ${b.total} 题）</p><button class="secondary" data-batch="${b.date}">${b.needsSubmission?'继续本组':'查看结果/订正'}</button></article>`).join('')}</section><div class="actions"><button class="secondary" id="settings">学习范围设置</button><button class="secondary" id="parent">家长统计</button></div></section>`);
  homeDate=workload.date;setScreen('home');
  const start=document.querySelector('#start');
  if(start)start.onclick=()=>once(startLatestBatch);
  document.querySelector('#open-backup')?.addEventListener('click',()=>location.href='./parent.html');
  document.querySelectorAll('[data-batch]').forEach(button=>button.onclick=()=>once(()=>openBatch(button.dataset.batch)));
  document.querySelector('#settings').onclick=settingsPage;document.querySelector('#parent').onclick=()=>location.href='./parent.html';
}
async function openBatch(batchDate){
  workload=await getDailyWorkload();const batch=workload.batches.find(b=>b.date===batchDate);if(!batch)throw Error('找不到这组任务');
  date=batchDate;task=await get('dailyTasks',date);questions=await questionsFor(task);if(questions.length!==10)throw Error('任务数据不完整');
  task.choiceOptionOrders ||= {};task.choiceOptionSnapshots ||= {};let changed=false;for(const q of questions.filter(isSingleChoice)){if(!task.choiceOptionOrders[q.id]){task.choiceOptionOrders[q.id]=optionOrder(q,date);changed=true}if(!task.choiceOptionSnapshots[q.id]&&!isFinalStage()){task.choiceOptionSnapshots[q.id]=q.options.map(option=>({...option}));changed=true}}if(changed)await saveTask();
  if(batch.submitted){await restoreSubmittedCheckin();return batch.corrections?correctionPage():reviewPage()}
  if(!task.startedAt){task.startedAt=Date.now();await saveTask()}
  if(!batch.remaining)return finalCheckPage();
  // Resume at an unanswered question, not at a retained draft from yesterday.
  return questionPage(batch.remainingIndices.includes(task.currentIndex)?task.currentIndex:batch.remainingIndices[0]);
}
function toolKeys(q){const basic=['+','−','×','÷','/','(',')'],powers=['²','³','⁴','⁵','⁶','⁷','⁸','⁹','¹⁰','^'];if(['rational_conditions','rational_solutions'].includes(q.answerType))return [...basic,'≠','=','，'];return q.answerType==='number'?basic:[...basic,'|',...powers]}
function inputTools(q){if(isSingleChoice(q))return '';const hint=['rational_expression','rational_conditions','rational_solutions','rational_multiple_blank'].includes(q.answerType)?'<p class="small">分子或分母有多项时请加括号，例如 (x+1)/(x-1)。</p><p class="small" id="math-live" aria-live="polite"></p>':'';return `${hint}<div class="math-tools">${toolKeys(q).map(k=>`<button type="button" data-key="${k}">${k}</button>`).join('')}</div>`}
function bindTools(){const inputs=[...document.querySelectorAll('[data-answer]')];const remember=e=>{activeMathInput=e.currentTarget;lastMathSelection=activeMathInput.selectionStart??activeMathInput.value.length;};inputs.forEach(input=>{['focus','click','keyup','select'].forEach(event=>input.addEventListener(event,remember));input.addEventListener('input',event=>{input.dataset.lastInputAt=String(Date.now());remember(event);markDirty();const live=document.querySelector('#math-live');if(live)live.innerHTML='当前输入：'+formatMath(input.value)});input.addEventListener('compositionstart',()=>{input.dataset.composing='true';markDirty()});input.addEventListener('compositionend',event=>{input.dataset.composing='false';input.dataset.lastInputAt=String(Date.now());remember(event)})});document.querySelectorAll('[data-key]').forEach(button=>{const keepInputFocus=e=>e.preventDefault();button.addEventListener('pointerdown',keepInputFocus);button.addEventListener('mousedown',keepInputFocus);button.addEventListener('click',()=>{const input=activeMathInput&&document.contains(activeMathInput)?activeMathInput:inputs[0];if(!input)return;const start=input.selectionStart??lastMathSelection??input.value.length,end=input.selectionEnd??start,key=button.dataset.key;input.value=input.value.slice(0,start)+key+input.value.slice(end);const cursor=start+key.length;input.focus({preventScroll:true});input.setSelectionRange(cursor,cursor);lastMathSelection=cursor;input.dispatchEvent(new Event('input',{bubbles:true}));});});}
async function save(q,r){r.key=`${date}:${q.id}`;r.date=date;r.questionId=q.id;await put('answers',r)}

async function questionPage(index){setScreen('practice');if(workload)workload=await getDailyWorkload();const q=questions[index],old=await record(q)||{};task.currentIndex=index;await saveTask();shell(`<section class="card question-card"><div class="topline"><span>本组第 ${index+1} / 10 题 · ${date}</span><span id="timer" class="tag"></span></div><div class="progress"><i style="width:${(index+1)/10*100}%"></i></div>${workload?`<p class="subtle small">今日待做 ${workload.remaining} 题（补做 ${workload.carryRemaining} ＋ 当天 ${workload.newRemaining}）；本组已暂存的答案保留。</p>`:''}${questionNav(index)}<span class="tag">${esc(knowledgePointName(q.knowledgePoint))}</span><div class="question ${displayClass(q.question)}">${formatMath(q.displayQuestion||q.question)}</div><div class="answer-area">${inputsFor(q,old)}</div>${inputTools(q)}<p class="subtle small">答案仅暂存；可直接选择任意题目回看，最后统一提交判分。</p><div class="actions">${index?'<button class="secondary" id="prev">上一题</button>':''}<button id="next">${index===9?'完成答题，检查并提交':'暂存并下一题'}</button><button class="warning" id="giveup">不会，暂时留空</button><button class="secondary" id="save-home">暂存并返回首页</button></div></section>`);startTimer();bindTools();bindChoices();document.querySelector('#next').onclick=()=>prepareDraft(q,index,false);document.querySelector('#giveup').onclick=()=>prepareDraft(q,index,true);document.querySelector('#save-home')?.addEventListener('click',()=>prepareDraft(q,index,false,'home'));document.querySelector('#prev')?.addEventListener('click',()=>prepareDraft(q,index,false,index-1));document.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>{const destination=Number(button.dataset.go);if(destination!==index)prepareDraft(q,index,false,destination)});}
function focusAnswerInput(){document.querySelector('[data-answer]')?.focus({preventScroll:true})}
function prepareDraft(q,index,giveUp,target){return once(async()=>{if(giveUp)return saveDraft(q,index,[],true,target);const values=await settledValues();if(q.answerType==='rational_expression'&&values[0]){try{parseRational(values[0])}catch(error){if(['ambiguous_division','character','syntax','bracket','zero_denominator','divide_by_zero'].includes(error.message)){alert(error.message==='ambiguous_division'?'除法后的乘积请加括号，例如 1/(2x) 或 (1/2)×x。':'输入格式不完整或分母为零，请检查符号和括号。');return}}}if(isSingleChoice(q)&&(!values[0]||!validateChoice(q))){alert('请选择一个有效选项。');return}const destination=target??(index===9?null:index+1),label=target==='home'?'确认暂存并返回首页':destination===null?'确认暂存并检查':destination<index?'确认暂存并返回上一题':'确认暂存并下一题';confirmSubmit(values,()=>saveDraft(q,index,values,false,target),focusAnswerInput,label,q)})}
function confirmSubmit(values,onConfirm,onEdit,label='确认暂存',q){const read=q&&isSingleChoice(q)?displayAnswer(q,values):values.map(normalizeMathInput).join('；'),overlay=document.createElement('section');overlay.className='confirm-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.innerHTML=`<div class="confirm-panel"><p class="eyebrow">提交前确认</p><h2>系统读取为</h2><div class="answer-key confirm-read">${formatMath(read)||'（留空）'}</div><p class="subtle">请核对后再暂存，确认前不会跳转下一题。</p><div class="actions confirm-actions"><button id="confirm">${esc(label)}</button><button class="secondary" id="edit">继续修改</button></div></div>`;const close=()=>overlay.remove();overlay.querySelector('#confirm').onclick=event=>{event.preventDefault();event.stopPropagation();close();once(onConfirm)};overlay.querySelector('#edit').onclick=event=>{event.preventDefault();event.stopPropagation();close();onEdit()};document.body.append(overlay)}
async function saveDraft(q,index,values,gaveUp,target){const r=await record(q)||newAttempt(q,{startTime:Date.now()});r.currentInputs=values;r.draftSaved=true;r.gaveUp=gaveUp||values.every(v=>!v);r.feedback=null;await save(q,r);if(target==='home')return home();let destination=target??(index===9?null:index+1);if(target===undefined&&date<today()){const saved=new Set((await answers()).filter(r=>r.draftSaved||isInitialSubmitted(r)).map(r=>r.questionId));const next=questions.findIndex((q,i)=>i>index&&!saved.has(q.id));const any=questions.findIndex(q=>!saved.has(q.id));destination=next>=0?next:any>=0?any:null;}return destination===null?finalCheckPage():questionPage(destination)}
async function finalCheckPage(){setScreen('practice');const rs=await answers(),drafts=rs.filter(r=>r.draftSaved).length,blank=questions.filter(q=>{const r=rs.find(x=>x.questionId===q.id);return !r?.currentInputs?.some(Boolean)}).length;shell(`<section class="card result"><p class="eyebrow">最终检查</p><h1 class="title">${drafts} / 10 题已暂存</h1><p class="subtle">现在仍可直接选择任意题修改答案。点击“全部提交”后，计时停止，并统一显示每题对错、标准答案和订正入口。</p>${questionNav(-1)}<div class="home-grid"><div class="metric">已填写<b>${10-blank} 题</b></div><div class="metric">暂时留空<b>${blank} 题</b></div><div class="metric">当前用时<b id="timer"></b></div></div><div class="actions"><button class="secondary" id="back">返回第 10 题</button><button class="secondary" id="check-home">返回首页</button><button id="final-submit">全部提交并查看结果</button></div></section>`);startTimer();document.querySelector('#back').onclick=()=>once(()=>questionPage(9));document.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>once(()=>questionPage(Number(button.dataset.go))));document.querySelector('#final-submit').onclick=()=>once(finalSubmit,'正在提交本组，请等待保存完成。');document.querySelector('#check-home')?.addEventListener('click',()=>once(home));}
async function writeCheckin(records){
  let checkinDate=date,taskDates=[date],completed=records;
  if(await setting(CARRYOVER_START_SETTING,null)){
    // A later correction refreshes its existing receipt, never fabricates a
    // new completion for today while today's work is still outstanding.
    if(task.submittedOn&&task.submittedOn!==today()){
      const prior=await get('checkins',task.submittedOn);
      if(prior?.taskDates?.includes(date)){
        const rows=(await all('answers')).filter(r=>prior.taskDates.includes(r.date)&&isInitialSubmitted(r));
        await put('checkins',{...prior,firstCorrect:rows.filter(r=>r.firstAttemptCorrect===true).length,wrong:rows.filter(r=>r.firstAttemptCorrect===false).length,manual:rows.filter(r=>r.firstAttemptCorrect===null&&!r.unanswered&&!r.invalidInput&&!r.manualResolved).length,corrected:rows.filter(r=>r.corrected).length});
      }
    }
    const current=await getDailyWorkload();if(current.needsSubmission)return;
    checkinDate=today();
    taskDates=current.batches.filter(b=>b.task.submittedOn===checkinDate||b.date===checkinDate&&b.submitted).map(b=>b.date);
    if(!taskDates.length)return;
    completed=(await all('answers')).filter(r=>taskDates.includes(r.date)&&isInitialSubmitted(r));
  }
  const existing=await get('checkins',checkinDate),first=completed.filter(r=>r.firstAttemptCorrect===true).length,wrong=completed.filter(r=>r.firstAttemptCorrect===false).length,manual=completed.filter(r=>r.firstAttemptCorrect===null&&!r.unanswered&&!r.invalidInput&&!r.manualResolved).length;
  await put('checkins',{...existing,date:checkinDate,completedAt:existing?.completedAt||Date.now(),firstCorrect:first,wrong,manual,corrected:completed.filter(r=>r.corrected).length,taskDates,totalQuestions:completed.length});
}
async function restoreSubmittedCheckin(){if(!isFinalStage()||await get('checkins',date))return;const records=await answers();if(records.length===questions.length&&records.every(isInitialSubmitted))await writeCheckin(records)}
function clearlyInvalidInput(question,values){return values.some(value=>{const text=String(value||'').trim();if(!text)return false;if(/[@#$%&?]/.test(text))return true;let depth=0;for(const c of text){if(c==='(')depth++;else if(c===')'&&--depth<0)return true}if(depth!==0)return true;if(question.answerType==='number'&&question.questionType!=='single_choice'&&(/[a-z]/i.test(text)||/^[+-]?\d+\s*\/\s*0+$/.test(text)))return true;return false})}
async function finalSubmit(){for(const q of questions.filter(isSingleChoice)){const r=await record(q);if(!r?.gaveUp&&(!validateChoice(q)||!q.options.some(option=>option.id===r?.currentInputs?.[0]))){alert('请先为每道选择题选择有效选项。');return}}task.phase='submitting';task.submittedOn=today();task.endedAt=Date.now();await saveTask();const submitted=[];for(const q of questions){let r=await record(q)||newAttempt(q,{currentInputs:[],draftSaved:true,gaveUp:true,startTime:task.startedAt});if(isInitialSubmitted(r)){submitted.push(r);continue}const source=task.items?.find(x=>x.questionId===q.id)?.sourceType;const values=r.currentInputs||[];const unanswered=r.gaveUp||!values.some(Boolean),verdict=unanswered?{unanswered:true}:{...scoreForFrozenPolicy(q,values,r)},invalidInput=Boolean(!unanswered&&(clearlyInvalidInput(q,values)||verdict.manualCheck&&['ambiguous_division','character','syntax','bracket','zero_denominator','divide_by_zero','condition_syntax','not_numeric'].includes(verdict.reason))),policy=initialAttemptPolicy(invalidInput?{unanswered:true}:verdict);r.unanswered=unanswered;r.invalidInput=invalidInput;r.manualReason=verdict.manualCheck&&!invalidInput?verdict.reason||'unresolved':null;r.submittedOn=today();r.submittedAt=Date.now();r.attemptCount=1;r.initialSubmitted=true;r.firstAnswer=values;r.initialOutcome=unanswered?'unanswered':invalidInput?'invalid':verdict.manualCheck?'manual':verdict.correct?'correct':'wrong';r.manualCheck=Boolean(verdict.manualCheck&&!invalidInput);r.firstAttemptCorrect=policy.firstAttemptCorrect;r.resolved=policy.resolved;r.endTime=r.resolved?task.endedAt:null;if(policy.countsForStatistics){if(policy.recordsWrongQuestion){r.firstWrongRecorded=true;await recordWrong(q.id,today())}else if(source==='wrong_review')await recordReviewCorrect(q.id);await updateKnowledge(q,today(),r.firstAttemptCorrect);}await save(q,r);submitted.push(r)}await writeCheckin(submitted);task.phase='review';await saveTask();return reviewPage()}

async function reviewPage(){setScreen('review');const rs=await answers(),byId=new Map(rs.map(r=>[r.questionId,r])),wrong=rs.filter(needsCorrection).length;shell(`<section class="card result"><p class="eyebrow">统一答案与订正</p><h1 class="title">本组已完成 10 / 10 题</h1><p class="subtle">任务来源：${date}。以下保留首次作答、标准答案与订正状态，方便复盘。</p><div class="answer-list">${questions.map((q,i)=>{const r=byId.get(q.id),firstState=currentFirstCorrect(q,r),pending=firstState===null,correct=firstState===true,rechecked=r?.firstAttemptCorrect===undefined&&correct,status=r?.unanswered?'首次未作答':r?.invalidInput?'输入格式有误':r?.manualResolved?'首次待确认，重新输入已通过':pending?'系统暂时无法可靠判断该题':correct?(rechecked?'首次作答：正确（按现行格式规则重新识别）':'首次作答：正确'):r?.corrected?'首次作答：不正确，已订正':'首次作答：不正确',note=r?.unanswered||r?.invalidInput||r?.manualResolved?'未计入首次正确率。':pending?'请重新输入或由家长确认。':correct?'':r?.corrected?'已完成订正':'需要订正',firstAnswer=displayAnswer(q,r?.firstAnswer);return `<article class="answer-key"><b>第 ${i+1} 题</b><div class="question small ${displayClass(q.question)}">${formatMath(q.displayQuestion||q.question)}</div><div>${status}</div><div class="${correct||pending?'student-answer':'student-answer wrong-answer'}">你的首次答案：${formatMath(firstAnswer)}</div>${isSingleChoice(q)?choiceFeedback(q,r):`<div class="standard-answer">标准答案：${formatMath(qAnswer(q))}</div>${q.explanation?`<p>解析：${formatMath(q.explanation)}</p>`:''}`}${note?`<div class="small">${note}</div>`:''}</article>`}).join('')}</div><div class="actions">${rs.some(r=>r.manualCheck&&r.firstAttemptCorrect===null)?'<button class="secondary" id="pending-later">暂留待确认并查看完成页</button>':''}<button id="correct">${wrong?`开始订正（${wrong}题）`:'返回完成页'}</button><button class="secondary" id="back">返回任务汇总 / 继续下一组</button></div></section>`);document.querySelector('#correct').onclick=()=>once(async()=>{if(!wrong)return resultPage();task.phase='correction';await saveTask();return correctionPage()});document.querySelector('#back').onclick=home;document.querySelector('#pending-later')?.addEventListener('click',()=>once(async()=>{if(!rs.some(r=>r.firstAttemptCorrect===false&&!r.resolved)){task.phase='complete';await saveTask()}return resultPage()}));}
async function correctionPage(){setScreen('correction');const rs=await answers(),r=rs.find(needsCorrection);if(!r)return finalize();const q=questions.find(x=>x.id===r.questionId),showAnswer=Boolean(r.feedback?.showAnswer),feedback=r.feedback?.kind==='correction'?`<div class="feedback bad">${esc(r.feedback.text)}</div>`:'',inputRecord={...r,currentInputs:r.correctionInputs||[]};let subtitle='请重新计算后提交；首次订正不会显示标准答案。',manualUI='';if(r.manualCheck&&r.firstAttemptCorrect===null){subtitle='系统暂时无法可靠判断这个答案，请检查输入格式后重新提交。';manualUI=`<div class="actions" style="margin-top:1rem;padding-top:1rem;border-top:1px dashed #ccc;"><p class="small" style="width:100%">系统无法判分，也可由家长协助判定：</p><button class="secondary" id="parent-correct">判为正确</button><button class="secondary" id="parent-wrong">判为错误</button></div>`;}shell(`<section class="card question-card"><div class="topline"><span>订正 ${rs.filter(needsCorrection).length} 题</span><span class="tag">${esc(knowledgePointName(q.knowledgePoint))}</span></div><div class="question ${displayClass(q.question)}">${formatMath(q.displayQuestion||q.question)}</div><p class="subtle">${subtitle}</p>${showAnswer?`<div class="answer-key">标准答案：${formatMath(qAnswer(q))}</div>`:''}<div class="answer-area">${inputsFor(q,inputRecord)}</div>${inputTools(q)}${feedback}<div class="actions"><button id="submit">${r.manualCheck&&r.firstAttemptCorrect===null?'重新输入':'提交订正'}</button><button class="secondary" id="back">返回统一答案</button><button class="secondary" id="correction-home">暂存订正并返回首页</button></div>${manualUI}</section>`);bindTools();bindChoices();document.querySelector('#submit').onclick=()=>prepareCorrectionSubmit(q,r);document.querySelector('#back').onclick=()=>leaveCorrection(q,r,reviewPage);document.querySelector('#correction-home')?.addEventListener('click',()=>leaveCorrection(q,r,home));if(r.manualCheck&&r.firstAttemptCorrect===null){document.querySelector('#parent-correct').onclick=()=>once(async()=>{r.manualDecision={correct:true,at:Date.now(),firstAnswer:[...(r.firstAnswer||[])]};r.initialOutcome||='manual';r.manualCheck=false;r.firstAttemptCorrect=true;r.resolved=true;r.endTime=Date.now();r.feedback=null;const source=task.items?.find(x=>x.questionId===q.id)?.sourceType;if(source==='wrong_review')await recordReviewCorrect(q.id);await updateKnowledge(q,today(),true);await save(q,r);return correctionPage();});document.querySelector('#parent-wrong').onclick=()=>once(async()=>{r.manualDecision={correct:false,at:Date.now(),firstAnswer:[...(r.firstAnswer||[])]};r.initialOutcome||='manual';r.manualCheck=false;r.firstAttemptCorrect=false;r.resolved=false;r.firstWrongRecorded=true;r.feedback=null;await recordWrong(q.id,today());await updateKnowledge(q,today(),false);await save(q,r);return correctionPage();});}}
function leaveCorrection(q,r,destination){
  return once(async()=>{
    if(!dirtyInput)return destination();
    const values=await settledValues();
    confirmSubmit(values,async()=>{await save(q,{...r,correctionInputs:values});return destination()},focusAnswerInput,'确认暂存订正',q);
  });
}
function prepareCorrectionSubmit(q,r){return once(async()=>{const values=await settledValues();if(isSingleChoice(q)&&!values[0]){alert('请选择一个选项。');return}confirmSubmit(values,()=>correctionSubmit(q,r,values),focusAnswerInput,'确认提交订正',q)})}
async function correctionSubmit(q,r,values){r.correctionInputs=values;const verdict=scoreForFrozenPolicy(q,values,r);if(r.manualCheck&&r.firstAttemptCorrect===null){r.attemptCount=nextAttemptCount(r.attemptCount);r.initialOutcome||='manual';r.manualResolutionAnswer=[...values];if(verdict.manualCheck){r.feedback={kind:'correction',showAnswer:false,text:'输入仍无法解析，请检查格式或由家长判定。'};}else if(!verdict.correct){r.feedback={kind:'correction',showAnswer:false,text:'本次重新输入不正确，请检查后重试。'};}else{r.manualCheck=false;r.manualResolved=true;r.manualResolutionCorrect=true;r.resolved=true;r.endTime=Date.now();r.feedback=null;}await save(q,r);return correctionPage();}r.attemptCount=nextAttemptCount(r.attemptCount);if(verdict.correct){r.finalAnswer=values;r.corrected=true;r.resolved=true;r.endTime=Date.now();r.feedback=null}else r.feedback={kind:'correction',showAnswer:true,text:verdict.manualCheck?'输入无法可靠解析，请对照标准答案检查后再修改。':'仍不正确，标准答案已显示，请检查符号、括号或分数。'};await save(q,r);return correctionPage()}
async function finalize(){const rs=await answers();if(rs.some(needsCorrection))return correctionPage();await writeCheckin(rs);task.phase='complete';await saveTask();return resultPage()}
async function resultPage(){setScreen('review');const rs=await answers(),states=rs.map(r=>currentFirstCorrect(questions.find(q=>q.id===r.questionId),r)),summary=summarizeFirstAttempts(states),corrected=rs.filter(x=>x.corrected).length,firstWrong=rs.filter(r=>currentFirstCorrect(questions.find(q=>q.id===r.questionId),r)===false),manualPending=rs.filter(r=>r.firstAttemptCorrect===null&&!r.unanswered&&!r.invalidInput&&!r.manualResolved).length,unansweredCount=rs.filter(r=>r.unanswered).length,invalidCount=rs.filter(r=>r.invalidInput).length,correctionPending=rs.filter(needsCorrection).length,accuracy=summary.accuracy===null?'暂无可统计数据':`${Math.round(summary.accuracy*100)}%`;const weak={},sources={weakness:0,review:0,wrong_review:0};for(const r of firstWrong){const q=questions.find(x=>x.id===r.questionId);weak[q.knowledgePoint]=(weak[q.knowledgePoint]||0)+1}for(const item of(task.items||[]))sources[item.sourceType]=(sources[item.sourceType]||0)+1;shell(`<section class="card result"><p class="eyebrow">本组完成 · ${date}</p><h1 class="title">10 / 10</h1><p class="subtle">总用时：${task.startedAt&&task.endedAt?duration(task.endedAt-task.startedAt):'—'}</p><div class="home-grid"><div class="metric">首次正确<b>${summary.correct} / ${summary.determined}</b></div><div class="metric">首次正确率<b>${accuracy}</b></div><div class="metric">已订正<b>${corrected} 题</b></div></div>${manualPending?`<p class="focus">待确认 ${manualPending} 题</p>`:''}${unansweredCount?`<p class="focus">未作答 ${unansweredCount} 题</p>`:''}${invalidCount?`<p class="focus">输入格式有误 ${invalidCount} 题</p>`:''}${firstWrong.length?`<section class="answer-key"><b>首次作答需要复习：${firstWrong.length} 题</b>${firstWrong.map(r=>{const q=questions.find(x=>x.id===r.questionId),number=questions.indexOf(q)+1,yourAnswer=displayAnswer(q,r.firstAnswer);return `<div class="small">第 ${number} 题 · ${esc(knowledgePointName(q.knowledgePoint))} · ${r.corrected?'已订正':'待订正'}<br><span class="wrong-answer">你的首次答案：${formatMath(yourAnswer)}</span><br><span class="standard-answer">标准答案：${formatMath(qAnswer(q))}</span></div>`}).join('')}</section>`:'<p class="focus">本次没有已判定的首次错误。</p>'}<p class="subtle">今日训练构成：弱项强化 ${sources.weakness||0} 题 · 普通复习 ${sources.review||0} 题 · 错题回炉 ${sources.wrong_review||0} 题</p><p class="focus">今天需要多复习：${esc(Object.keys(weak).map(knowledgePointName).join('、')||'今天的基础很扎实')}</p><div class="actions">${correctionPending?'<button id="correct">继续订正/确认</button>':''}<button class="secondary" id="details">查看逐题结果</button><button class="secondary" id="back">返回任务汇总 / 继续下一组</button></div></section>`);document.querySelector('#correct')?.addEventListener('click',correctionPage);document.querySelector('#details').onclick=reviewPage;document.querySelector('#back').onclick=home}
async function settingsPage(){
  setScreen('settings');
  const [enabled,bank]=await Promise.all([enabledPoints(),all('questions')]);
  shell(`<section class="card"><p class="eyebrow">学习范围</p><h1 class="title">已学习的知识点</h1><p class="subtle">保存后用于尚未生成的每日任务。</p><div class="answer-area">${ALL_KNOWLEDGE_POINTS.map(p=>`<label><input type="checkbox" value="${p}" ${enabled.includes(p)?'checked':''}> ${esc(knowledgePointName(p))}</label>`).join('')}</div><p id="scope-status" class="subtle" role="status"></p><div class="actions"><button id="save-settings">保存设置</button><button class="secondary" id="cancel">返回</button></div></section>`);
  const status=document.querySelector('#scope-status'),button=document.querySelector('#save-settings');
  const selected=()=>[...app.querySelectorAll('input:checked')].map(input=>input.value);
  const refresh=()=>{
    const state=inspectLearningScope(bank,selected());
    status.textContent=`已选 ${state.selectedCount} 个知识点 · 可用 ${state.eligibleCount} 道正式题 · ${state.valid?'满足每日 10 题要求':`还差 ${state.missingCount} 道，无法保存`}`;
    button.disabled=!state.valid;
  };
  app.querySelectorAll('input[type=checkbox]').forEach(input=>input.addEventListener('change',refresh));
  refresh();
  button.onclick=async()=>{
    button.disabled=true;
    try{await saveLearningScope(selected());await home();initDailyRollover()}
    catch(error){refresh();status.textContent+=`。${error.message}`}
  };
  document.querySelector('#cancel').onclick=home;
}
const isScopeError=error=>['INSUFFICIENT_LEARNING_SCOPE','PROTECTED_INCOMPLETE_TASK'].includes(error?.code);
function showStartupError(error){
  setScreen('recovery');
  const label=error.code==='INSUFFICIENT_LEARNING_SCOPE'?'请调整学习范围':error.code==='PROTECTED_INCOMPLETE_TASK'?'这组任务需要人工核查':'暂时无法启动';
  const actions=isScopeError(error)?`<div class="actions">${error.code==='INSUFFICIENT_LEARNING_SCOPE'?'<button id="adjust-scope">调整学习范围</button>':''}<button class="secondary" id="open-backup">前往家长模式备份</button></div>`:'';
  shell(`<section class="card"><h1>${label}</h1><p>${esc(error.message)}</p>${actions}</section>`);
  document.querySelector('#adjust-scope')?.addEventListener('click',settingsPage);
  document.querySelector('#open-backup')?.addEventListener('click',()=>location.href='./parent.html');
}
async function startPracticeApp(){
  try{
    await openDB();
    const imported=await importQuestions({deferFixedQuestionSync:true});
    await runQuestionBankFixMigration(imported.incoming||[]);
    date=today();
    workload=await getDailyWorkload();
    if(!workload.anomalies.some(item=>item.date===date)){
      task=await getOrCreateToday();
      questions=await questionsFor(task);
      if(questions.length!==10)throw Error('今日任务生成失败');
      await restoreSubmittedCheckin();
    }
    await home();
    const safety=await dataSafetyStatus();if(safety.migration?.ok!==false)await showUpdateSuccess();
    initDailyRollover();
  }catch(error){showStartupError(error);console.error(error)}
  refreshPwaUpdates=initPwaUpdates({getBlockReason:updateBlockReason});
}
async function boot(){
  const locks=globalThis.navigator?.locks;
  if(!locks)return startPracticeApp();
  await locks.request(LEARNING_SESSION_LOCK,{mode:'shared'},async()=>{
    const active=new Promise(resolve=>globalThis.addEventListener('pagehide',resolve,{once:true}));
    globalThis.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
    await startPracticeApp();
    await active;
  });
}
boot();
