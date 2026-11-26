import assert from 'node:assert/strict';
import {calculateCoverage} from '../js/coverage.js';
import {buildAdaptiveTask} from '../js/questionEngine.js';
const questions=Array.from({length:20},(_,i)=>({id:`Q${String(i+1).padStart(4,'0')}`,knowledgePoint:i<10?'相反数':'绝对值',answer:'1',answerType:'number'}));
const answers=[{key:'2026-01-01:Q0001',questionId:'Q0001',initialSubmitted:true,firstAttemptCorrect:false},{key:'2026-01-02:Q0001',questionId:'Q0001',resolved:true},{key:'2026-01-02:Q0002',questionId:'Q0002',draftSaved:true},{questionId:'MISSING',initialSubmitted:true}];
const summary=calculateCoverage({questions,answers,history:[{questionId:'Q0002'}],tasks:[{questionIds:['Q0003']}],enabled:['相反数']});
assert.deepEqual([summary.total,summary.done,summary.remaining,summary.attempts,summary.repeats,summary.scheduled,summary.scopedTotal,summary.scopedDone],[20,1,19,2,1,2,10,1]);
assert.equal(calculateCoverage().rate,0);
const task=buildAdaptiveTask({date:'2026-11-25',questions,enabled:['相反数','绝对值'],answers,history:[{questionId:'Q0002'}],tasks:[{date:'2026-11-24',phase:'practice',questionIds:['Q0002','Q0003']}],checkins:Array(5).fill({})});
assert.equal(task.questionIds.length,10);assert.equal(new Set(task.questionIds).size,10);
const fresh=task.items.filter(x=>x.selectionReason==='unseen_question_coverage');assert.equal(fresh.length,2);assert.ok(fresh.every(x=>!['Q0001','Q0002','Q0003'].includes(x.questionId)));
const mature=['相反数','绝对值'].map(knowledgePoint=>({knowledgePoint,attempts:8,last20Attempts:[true,true,true,true,true,false,false,false],recentAccuracy:62.5}));
const submitted=questions.slice(0,19).map(q=>({date:'2026-11-01',questionId:q.id,initialSubmitted:true,firstAttemptCorrect:true}));
for(const [records,expected] of [[submitted,1],[questions.map(q=>({date:'2026-11-01',questionId:q.id,initialSubmitted:true})),0]]){
 const t=buildAdaptiveTask({date:'2026-11-26',questions,enabled:['相反数','绝对值'],answers:records,stats:mature,checkins:Array(5).fill({})});
 assert.equal(t.questionIds.length,10);assert.equal(new Set(t.questionIds).size,10);assert.equal(t.items.filter(i=>i.selectionReason==='unseen_question_coverage').length,expected);
}
const first=buildAdaptiveTask({date:'2026-11-26',questions,enabled:['相反数','绝对值'],answers:[],stats:mature,checkins:Array(5).fill({})});
const next=buildAdaptiveTask({date:'2026-11-27',questions,enabled:['相反数','绝对值'],answers:[],stats:mature,checkins:Array(5).fill({}),tasks:[{...first,phase:'practice'}]});
const firstCoverage=new Set(first.items.filter(i=>i.selectionReason==='unseen_question_coverage').map(i=>i.questionId));
assert.ok(next.items.filter(i=>i.selectionReason==='unseen_question_coverage').every(i=>!firstCoverage.has(i.questionId)));
const singleton=[...questions,{id:'ONE',knowledgePoint:'单项式乘法',answer:'1',answerType:'number'}];
const singletonTask=buildAdaptiveTask({date:'2026-11-27',questions:singleton,enabled:['相反数','绝对值','单项式乘法'],answers:singleton.map(q=>({date:'2026-11-01',questionId:q.id,initialSubmitted:true})),stats:[...mature,{knowledgePoint:'单项式乘法',attempts:1}],history:[{questionId:'ONE',lastShownDate:'2026-11-26',shownCount:1}],checkins:Array(5).fill({})});
assert.ok(!singletonTask.items.some(i=>i.questionId==='ONE'&&i.selectionReason==='low_sample_coverage'),'仅有一道题时不得为了补样本连续练习');
console.log('v0.5.4 coverage and occupied-task checks PASS');
