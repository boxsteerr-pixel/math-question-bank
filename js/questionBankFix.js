import {score} from './scoring.js';

export const QUESTION_BANK_FIX_VERSION=2;
export const FIXED_QUESTION_IDS=new Set(['Q0024','Q0028','Q0068','Q0125','Q0137']);
const legacyQ0068Answer='a-b+c';
const clone=value=>structuredClone(value);
const dateAdd=(date,days)=>{const d=new Date(`${date}T00:00:00`);d.setDate(d.getDate()+days);return d.toLocaleDateString('en-CA')};
const sorted=items=>items.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||Number(a.endTime||0)-Number(b.endTime||0)||String(a.key).localeCompare(String(b.key)));
const firstAnswer=record=>(record.firstAnswer||[]).filter(Boolean);
const isScored=record=>record.firstAttemptCorrect===true||record.firstAttemptCorrect===false;
const emptyStat=knowledgePoint=>({questionId:knowledgePoint,knowledgePoint,attempts:0,firstCorrect:0,firstAccuracy:0,recentAttempts:[],recentCorrect:0,recentAccuracy:0,last20Attempts:[],consecutiveCorrect:0,consecutiveWrong:0,historicalWrong:0,lastAttemptDate:null});

function rebuildStat(knowledgePoint,answers,questionById){
  const stat=emptyStat(knowledgePoint);
  for(const record of sorted(answers.filter(item=>questionById.get(item.questionId)?.knowledgePoint===knowledgePoint&&isScored(item)))){
    const correct=record.firstAttemptCorrect===true;
    stat.attempts++;
    if(correct){stat.firstCorrect++;stat.consecutiveCorrect++;stat.consecutiveWrong=0}else{stat.consecutiveWrong++;stat.consecutiveCorrect=0;stat.historicalWrong++}
    stat.recentAttempts=[...stat.recentAttempts.slice(-19),{date:record.date,firstCorrect:correct}];
    stat.last20Attempts=[...stat.last20Attempts.slice(-19),correct];
    stat.lastAttemptDate=record.date;
  }
  stat.firstAccuracy=stat.attempts?stat.firstCorrect/stat.attempts:0;
  stat.recentCorrect=stat.last20Attempts.filter(Boolean).length;
  stat.recentAccuracy=stat.last20Attempts.length?stat.recentCorrect/stat.last20Attempts.length*100:0;
  return stat;
}
function checkinFor(date,answers,old){
  const rows=answers.filter(item=>item.date===date);
  return {...old,date,firstCorrect:rows.filter(item=>item.firstAttemptCorrect===true).length,wrong:rows.filter(item=>item.firstAttemptCorrect===false).length,manual:rows.filter(item=>item.firstAttemptCorrect===null).length,corrected:rows.filter(item=>item.corrected).length};
}
function replayWrong(questionId,answers,tasks){
  let state=null;
  const sourceFor=(record)=>tasks.find(task=>task.date===record.date)?.items?.find(item=>item.questionId===questionId)?.sourceType;
  for(const record of sorted(answers.filter(item=>item.questionId===questionId&&isScored(item)))){
    if(record.firstAttemptCorrect===false){state={questionId,firstWrongDate:record.date,lastWrongDate:record.date,wrongCount:(state?.wrongCount||0)+1,reviewStage:1,nextReviewDate:dateAdd(record.date,1),reviewCorrectStreak:0,mastered:false};continue}
    if(sourceFor(record)==='wrong_review'&&state&&!state.mastered){const streak=(state.reviewCorrectStreak||0)+1;state.reviewCorrectStreak=streak;if(streak>=3){state.reviewStage=3;state.mastered=true;state.nextReviewDate=null}else{state.reviewStage=streak+1;state.nextReviewDate=dateAdd(state.firstWrongDate,streak===1?4:7)}}
  }
  return state;
}

export function applyQuestionBankFix(snapshot){
  const next=clone(snapshot),questions=new Map(next.questions.map(question=>[question.id,question])),log=[],changedDates=new Set,changedQuestionIds=new Set,affectedPoints=new Set;
  for(const record of next.answers){
    if(!FIXED_QUESTION_IDS.has(record.questionId))continue;
    const oldFirstAttemptCorrect=record.firstAttemptCorrect;
    const entry={date:record.date,questionId:record.questionId,oldFirstAnswer:firstAnswer(record),oldFirstAttemptCorrect,newCalculatedCorrect:null,actionsTaken:[]};
    if(record.questionId==='Q0028'){entry.actionsTaken.push('题面已更新；按规则不重判历史结果');log.push(entry);continue}
    if(record.questionId==='Q0068'&&score({answerType:'expression',answer:legacyQ0068Answer},firstAnswer(record)).correct){record.legacyQuestionMismatch=true;entry.actionsTaken.push('标记 legacyQuestionMismatch；保留原历史判定');log.push(entry);continue}
    const question=questions.get(record.questionId),verdict=firstAnswer(record).length?score(question,firstAnswer(record)):{correct:false};
    entry.newCalculatedCorrect=verdict.manualCheck?null:verdict.correct===true;
    if(record.firstAttemptCorrect===false&&entry.newCalculatedCorrect===true){record.firstAttemptCorrect=true;record.resolved=true;record.manualCheck=false;record.firstWrongRecorded=false;record.corrected=false;record.feedback=null;changedDates.add(record.date);changedQuestionIds.add(record.questionId);affectedPoints.add(question.knowledgePoint);entry.actionsTaken.push('首次作答改为正确；取消由误判产生的错误状态');}
    else entry.actionsTaken.push('无需修改');
    log.push(entry);
  }
  for(const point of affectedPoints){if(!point)continue;const rebuilt=rebuildStat(point,next.answers,questions),index=next.knowledgeStats.findIndex(item=>item.knowledgePoint===point||item.questionId===point);if(index>=0)next.knowledgeStats[index]=rebuilt;else next.knowledgeStats.push(rebuilt)}
  for(const date of changedDates){const index=next.checkins.findIndex(item=>item.date===date);if(index>=0)next.checkins[index]=checkinFor(date,next.answers,next.checkins[index])}
  for(const id of changedQuestionIds){const rebuilt=replayWrong(id,next.answers,next.dailyTasks),index=next.wrongQuestions.findIndex(item=>item.questionId===id);if(rebuilt){if(index>=0)next.wrongQuestions[index]=rebuilt;else next.wrongQuestions.push(rebuilt)}else if(index>=0)next.wrongQuestions.splice(index,1)}
  for(const task of next.dailyTasks){let changed=false;const items=(task.items||[]).map(item=>{if(item.sourceType!=='wrong_review'||!changedQuestionIds.has(item.questionId))return item;const priorWrong=next.answers.some(answer=>answer.questionId===item.questionId&&answer.firstAttemptCorrect===false&&answer.date<task.date);if(priorWrong)return item;changed=true;return {...item,sourceType:'review',selectionReason:'migration: removed invalid wrong-review schedule'} });if(changed)task.items=items}
  const fixed=log.filter(entry=>entry.actionsTaken.some(action=>action.startsWith('首次作答改为正确'))).length,legacy=log.filter(entry=>entry.actionsTaken.some(action=>action.includes('legacyQuestionMismatch'))).length;
  return {snapshot:next,log:{version:QUESTION_BANK_FIX_VERSION,updatedQuestions:FIXED_QUESTION_IDS.size,scannedRecords:log.length,fixedRecords:fixed,unchangedRecords:log.length-fixed,legacyQuestionMismatch:legacy,entries:log,completedAt:new Date().toISOString()}};
}
