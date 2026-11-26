// Coverage is derived from existing records; drafts never count as submissions.
export const isFormalAttempt=r=>Boolean(r?.initialSubmitted||r?.resolved||r?.firstAttemptCorrect!==undefined||r?.firstAnswer!==undefined);
export function calculateCoverage({questions=[],answers=[],history=[],tasks=[],enabled=[],stats=[]}={}){
 const bank=new Map();for(const q of questions)if(typeof q?.id==='string'&&q.id.trim()&&!bank.has(q.id))bank.set(q.id,q);
 const attempted=new Set(),scheduled=new Set(),counts=new Map(),dates=new Map(),records=new Set();
 for(const h of history)if(bank.has(h.questionId))scheduled.add(h.questionId);
 for(const t of tasks)for(const id of Array.isArray(t?.questionIds)?t.questionIds:[])if(bank.has(id))scheduled.add(id);
 for(const r of answers){if(!bank.has(r.questionId)||!isFormalAttempt(r))continue;
  const key=r.key||`${r.date||r.submittedOn||''}:${r.questionId}`;if(records.has(key))continue;records.add(key);
  attempted.add(r.questionId);const point=bank.get(r.questionId).knowledgePoint;counts.set(point,(counts.get(point)||0)+1);
  const date=r.submittedOn||r.date||'';if(date>(dates.get(point)||''))dates.set(point,date);
 }
 const rate=(a,b)=>b?a/b:0, scope=new Set(enabled),rows=new Map(),states=new Map(stats.map(s=>[s.knowledgePoint,s]));
 for(const q of bank.values()){const name=q.knowledgePoint;if(!rows.has(name))rows.set(name,{knowledgePoint:name,total:0,done:0,unseen:[],attempts:counts.get(name)||0,lastDate:dates.get(name)||null,enabled:scope.has(name),stat:states.get(name)});const row=rows.get(name);row.total++;if(attempted.has(q.id))row.done++;else row.unseen.push({...q,scheduled:scheduled.has(q.id)});}
 let scopedTotal=0,scopedDone=0;for(const row of rows.values()){row.remaining=row.total-row.done;row.rate=rate(row.done,row.total);if(row.enabled){scopedTotal+=row.total;scopedDone+=row.done}}
 return {total:bank.size,scheduled:scheduled.size,done:attempted.size,remaining:bank.size-attempted.size,rate:rate(attempted.size,bank.size),attempts:records.size,repeats:Math.max(0,records.size-attempted.size),repeatRate:rate(Math.max(0,records.size-attempted.size),records.size),scopedTotal,scopedDone,scopedRemaining:scopedTotal-scopedDone,scopedRate:rate(scopedDone,scopedTotal),rows:[...rows.values()]};
}
