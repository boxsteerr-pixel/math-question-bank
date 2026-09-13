import assert from 'node:assert/strict';
import {initialAttemptPolicy} from '../js/attemptPolicy.js';

function applyInitialAttempt(state,policy){
  const next=structuredClone(state);
  if(policy.recordsWrongQuestion)next.wrongQuestions.push({questionId:'Q-test'});
  if(policy.countsForStatistics){next.stat.attempts++;if(policy.firstAttemptCorrect===true){next.stat.firstCorrect++;next.stat.consecutiveWrong=0}else{next.stat.consecutiveWrong++;next.stat.recentAccuracy-=10;next.stat.historicalWrong++}}
  return next;
}

const before={wrongQuestions:[],stat:{attempts:4,firstCorrect:3,consecutiveWrong:0,recentAccuracy:75,historicalWrong:1}};
const manual=initialAttemptPolicy({manualCheck:true,correct:false}),afterManual=applyInitialAttempt(before,manual);
assert.equal(manual.firstAttemptCorrect,null);
assert.equal(manual.countsForStatistics,false);
assert.equal(manual.recordsWrongQuestion,false);
assert.deepEqual(afterManual,before,'manualCheck 不得污染错题或知识统计');

const wrong=initialAttemptPolicy({correct:false}),afterWrong=applyInitialAttempt(before,wrong);
assert.equal(wrong.firstAttemptCorrect,false);
assert.equal(afterWrong.wrongQuestions.length,1,'普通错误必须进入错题');
assert.equal(afterWrong.stat.consecutiveWrong,1,'普通错误必须增加连续错误');
assert.equal(afterWrong.stat.recentAccuracy,65,'普通错误必须影响正确率');
console.log('Manual-check policy scenarios passed.');
