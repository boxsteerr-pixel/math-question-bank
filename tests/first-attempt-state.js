import assert from 'node:assert/strict';
import {currentFirstCorrect,summarizeFirstAttempts,nextAttemptCount} from '../js/attemptPolicy.js';

const question={id:'Q-test'};
let fallbackCalls=0;
const fallback=value=>()=>{fallbackCalls++;return value};
assert.equal(currentFirstCorrect(question,{firstAttemptCorrect:true},fallback(true)),true);
assert.equal(currentFirstCorrect(question,{firstAttemptCorrect:false},fallback(true)),false);
assert.equal(currentFirstCorrect(question,{firstAttemptCorrect:null,manualCheck:true},fallback(true)),null);
assert.equal(currentFirstCorrect(question,{initialSubmitted:true,firstAnswer:['a']},fallback(true)),true);
assert.equal(currentFirstCorrect(question,{initialSubmitted:true,firstAnswer:['a']},fallback(false)),false);
assert.equal(fallbackCalls,2,'只有 undefined 老记录可以调用兼容评分');

const summary=summarizeFirstAttempts([true,false,null]);
assert.deepEqual(summary,{correct:1,wrong:1,pending:1,determined:2,accuracy:.5});
assert.equal(summary.correct,1,'null 不计入首次正确');
assert.equal(summary.wrong,1,'null 不计入首次错误');
assert.equal(summary.pending,1,'null 必须计入待确认');
assert.equal(currentFirstCorrect(question,{firstAttemptCorrect:null,manualCheck:true},fallback(true)),null,'null 不得触发 legacy rechecked');
assert.equal(fallbackCalls,2,'manualCheck 的 null 不得调用兼容评分');
assert.deepEqual(summarizeFirstAttempts([null]),{correct:0,wrong:0,pending:1,determined:0,accuracy:null},'全为待确认时没有可统计的正确率');
assert.equal(nextAttemptCount(1),2,'manualCheck 后重新提交是新的作答次数');
console.log('First-attempt tri-state scenarios passed.');
