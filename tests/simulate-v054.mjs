// Local-only aggregate simulation. The input backup is never copied or printed.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {buildAdaptiveTask as current,powerBoostActive} from '../js/questionEngine.js';
import {afterWrong,afterReviewCorrect} from '../js/wrongQuestions.js';
import {calculateCoverage,isFormalAttempt} from '../js/coverage.js';
import {KNOWLEDGE_POINTS} from '../js/knowledgePoints.js';
const file=process.argv[2];if(!file)throw Error('Provide local backup path');
const backup=JSON.parse(fs.readFileSync(file,'utf8'));if(backup.appVersion!=='0.5.3'||backup.createdAt!=='2026-11-25T13:25:45.706Z')throw Error('Wrong backup');
const questions=JSON.parse(fs.readFileSync('data/questions.json','utf8'));
let old=execFileSync('git',['show','afb2189797f291c334ad31ada9e64d5be2f239bd:js/questionEngine.js'],{encoding:'utf8'});
old=old.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${pathToFileURL(process.cwd()+'/js/'+p.slice(2)).href}'`);
const legacy=(await import('data:text/javascript;base64,'+Buffer.from(old).toString('base64'))).buildAdaptiveTask;
const levels=[7,14,30,60],setting=key=>backup.stores.settings.find(s=>s.key===key)?.value;
const enabled=setting('enabledKnowledgePoints')||KNOWLEDGE_POINTS,boostStart=setting('powerBoostStartCheckinCount');
function run(select,errors){
 const data=structuredClone(backup.stores),stats=new Map(data.knowledgeStats.map(s=>[s.knowledgePoint,s])),history=new Map(data.questionHistory.map(s=>[s.questionId,s])),wrongs=new Map(data.wrongQuestions.map(s=>[s.questionId,s])),seen=new Set(data.answers.filter(isFormalAttempt).map(a=>a.questionId)),counts={},last={},wait={},reports=[];
 let repeats=0,dueCompleted=0,dueOffered=0;
 for(let day=1;day<=60;day++){
  const date=new Date(Date.UTC(2026,10,25+day)).toISOString().slice(0,10);
  const due=[...wrongs.values()].filter(w=>!w.mastered&&w.nextReviewDate&&w.nextReviewDate<=date).length;dueOffered+=Math.min(2,due);
  const task=select({date,questions,enabled,checkins:data.checkins,stats:[...stats.values()],wrongQuestions:[...wrongs.values()],history:[...history.values()],answers:data.answers,tasks:data.dailyTasks,powerBoost:powerBoostActive(data.checkins.length,boostStart)});
  if(task.questionIds.length!==10||new Set(task.questionIds).size!==10)throw Error(`Invalid task ${date}`);
  for(const item of task.items){const q=questions.find(q=>q.id===item.questionId),id=q.id,k=q.knowledgePoint,correct=!errors||Number(id.slice(1))%5!==0;
   if(seen.has(id))repeats++;seen.add(id);counts[k]=(counts[k]||0)+1;wait[k]=Math.max(wait[k]||0,day-(last[k]||0));last[k]=day;
   const s=stats.get(k)||{knowledgePoint:k,attempts:0,firstCorrect:0,last20Attempts:[],consecutiveWrong:0,historicalWrong:0};
   s.attempts++;s.firstCorrect+=(correct?1:0);s.last20Attempts=[...(s.last20Attempts||[]),correct].slice(-20);s.recentAccuracy=100*s.last20Attempts.filter(Boolean).length/s.last20Attempts.length;s.consecutiveWrong=correct?0:(s.consecutiveWrong||0)+1;s.historicalWrong=(s.historicalWrong||0)+(correct?0:1);s.lastAttemptDate=date;stats.set(k,s);
   const previous=wrongs.get(id);if(!correct)wrongs.set(id,afterWrong(previous||{questionId:id},date));else if(item.sourceType==='wrong_review'&&previous){wrongs.set(id,afterReviewCorrect(previous));dueCompleted++}
   data.answers.push({key:`${date}:${id}`,date,questionId:id,initialSubmitted:true,firstAttemptCorrect:correct});const h=history.get(id)||{questionId:id,shownCount:0};h.shownCount++;h.lastShownDate=date;history.set(id,h);
  }
  data.dailyTasks.push({...task,phase:'complete'});data.checkins.push({date});
  if(levels.includes(day)){const c=calculateCoverage({questions,answers:data.answers});reports.push({days:day,covered:c.done,remaining:c.remaining,rate:c.rate,repeats,sampleInsufficient:enabled.filter(k=>(stats.get(k)?.attempts||0)<5).length,dueOffered,dueCompleted,topicCounts:{...counts},longestWait:Math.max(0,...enabled.map(k=>Math.max(wait[k]||0,day-(last[k]||0))))})}
 }
 return reports;
}
const output={};for(const [name,errors] of [['all_correct',false],['persistent_errors',true]])output[name]={old:run(legacy,errors),new:run(current,errors)};
console.log(JSON.stringify(output,null,2));
