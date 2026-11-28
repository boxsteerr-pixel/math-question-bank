import {get,put} from './db.js';
export const MIN_SAMPLE_SIZE=5;
const levels=['mastered','mostly_mastered','weak','priority_weak'];
const empty=k=>({questionId:k,knowledgePoint:k,attempts:0,firstCorrect:0,firstAccuracy:0,recentAttempts:[],recentCorrect:0,recentAccuracy:0,last20Attempts:[],consecutiveCorrect:0,consecutiveWrong:0,historicalWrong:0,lastAttemptDate:null});
export function knowledgeState(stat){const s={...empty(stat?.knowledgePoint||''),...stat};const recent=(s.last20Attempts?.length?s.last20Attempts:(s.recentAttempts||[]).map(x=>typeof x==='boolean'?x:x.firstCorrect)).slice(-20);const recentAccuracy=recent.length?recent.filter(Boolean).length/recent.length*100:0;if(s.attempts<MIN_SAMPLE_SIZE)return 'insufficient_data';let state=recentAccuracy>=90?'mastered':recentAccuracy>=80?'mostly_mastered':recentAccuracy>=60?'weak':'priority_weak';if(s.consecutiveWrong>=3)return 'priority_weak';if(s.consecutiveWrong>=2)state=levels[Math.min(levels.length-1,levels.indexOf(state)+1)];return state}
export function weaknessScore(stat){const s={...empty(stat?.knowledgePoint||''),...stat},state=knowledgeState(s),recent=s.recentAccuracy??0;if(state==='insufficient_data')return 0;const base={mastered:5,mostly_mastered:25,weak:55,priority_weak:80}[state];return Math.round(base+(100-recent)*.12+Math.min(18,s.consecutiveWrong*6)+(s.last20Attempts?.at(-1)===false?6:0)+Math.min(10,(s.historicalWrong||0)*.8));}
export function summarizeKnowledge(stat){const s={...empty(stat?.knowledgePoint||''),...stat};return {...s,state:knowledgeState(s),weaknessScore:weaknessScore(s)} }
export async function updateKnowledge(question,date,firstCorrect){const k=question.knowledgePoint,old={...empty(k),...(await get('knowledgeStats',k)||{})};const legacy=(old.last20Attempts?.length?old.last20Attempts:(old.recentAttempts||[]).map(x=>typeof x==='boolean'?x:x.firstCorrect));old.attempts++;if(firstCorrect){old.firstCorrect++;old.consecutiveCorrect++;old.consecutiveWrong=0}else{old.consecutiveWrong++;old.consecutiveCorrect=0;old.historicalWrong=(old.historicalWrong||0)+1}old.firstAccuracy=old.firstCorrect/old.attempts;old.recentAttempts=[...(old.recentAttempts||[]).slice(-19),{date,firstCorrect}];old.last20Attempts=[...legacy.slice(-19),firstCorrect];old.recentCorrect=old.last20Attempts.filter(Boolean).length;old.recentAccuracy=old.recentCorrect/old.last20Attempts.length*100;old.lastAttemptDate=date;await put('knowledgeStats',old);return summarizeKnowledge(old)}

// Original outcome is independent of later correction or parental decisions.
export function originalAttemptState(record){
  if(!record)return 'unanswered';
  if(['correct','wrong','unanswered','invalid','manual'].includes(record.initialOutcome))return record.initialOutcome;
  if(record.manualDecision||record.manualResolved)return 'unavailable';
  if(record.unanswered)return 'unanswered';if(record.invalidInput)return 'invalid';
  if(record.firstAttemptCorrect===true)return 'correct';if(record.firstAttemptCorrect===false)return 'wrong';
  if(record.manualCheck)return 'manual';
  if(!record.initialSubmitted&&!record.resolved&&record.firstAnswer===undefined)return 'unanswered';
  return 'unavailable';
}
export function summarizeTaskOutcomes(task,answers=[]){
  const ids=Array.isArray(task?.questionIds)?task.questionIds:[],counts={correct:0,wrong:0,unanswered:0,invalid:0,manual:0,unavailable:0};
  const relevant=answers.filter(r=>r.date===task.date||String(r.key||'').startsWith(`${task.date}:`));
  const byId=new Map(relevant.map(r=>[r.questionId,r]));
  let pendingCorrection=0,pendingManual=0,effectiveCorrect=0,effectiveWrong=0;
  for(const id of ids){const r=byId.get(id),state=originalAttemptState(r);counts[state]++;
    if(r?.firstAttemptCorrect===false&&!r.resolved)pendingCorrection++;
    if(r?.manualCheck&&r.firstAttemptCorrect===null&&!r.manualResolved)pendingManual++;
    if(r?.firstAttemptCorrect===true)effectiveCorrect++;else if(r?.firstAttemptCorrect===false)effectiveWrong++;
  }
  const determined=counts.correct+counts.wrong,submitted=Boolean(task?.submittedOn||['review','correction','complete'].includes(task?.phase));
  return {total:ids.length,...counts,firstGroupRate:ids.length&&counts.unavailable===0?counts.correct/ids.length:null,
    judgedAccuracy:determined?counts.correct/determined:null,pendingCorrection,pendingManual,submitted,
    processing:!submitted?'未提交':pendingCorrection?'待订正':pendingManual?'待人工确认':'已完成相应处理',effectiveCorrect,effectiveWrong};
}
