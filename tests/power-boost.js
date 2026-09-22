import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildAdaptiveTask,powerBoostActive,powerBoostStatus,POWER_BOOST_DAYS} from '../js/questionEngine.js';

const bank=JSON.parse(fs.readFileSync(new URL('../data/questions.json',import.meta.url),'utf8'));
const powerIds=new Set(Array.from({length:20},(_,index)=>`Q${String(index+180).padStart(4,'0')}`));
const highIds=new Set(['Q0183','Q0184','Q0186','Q0189','Q0190','Q0191','Q0192','Q0194','Q0197','Q0198']);
const points=[...new Set(bank.map(question=>question.knowledgePoint))];
const checkins=Array.from({length:5},(_,index)=>({date:`2026-10-${String(index+1).padStart(2,'0')}`}));
const stats=points.map(knowledgePoint=>({knowledgePoint,attempts:10,firstCorrect:9,last20Attempts:Array(10).fill(true),recentAccuracy:90,consecutiveWrong:0,historicalWrong:0}));
const wrong=(questionId,date='2026-10-01')=>({questionId,firstWrongDate:date,lastWrongDate:date,wrongCount:1,reviewStage:1,nextReviewDate:date,reviewCorrectStreak:0,mastered:false});
const boostItems=task=>task.items.filter(item=>item.selectionReason.startsWith('power_boost:'));
const powerReviews=task=>task.items.filter(item=>item.sourceType==='wrong_review'&&powerIds.has(item.questionId));
const task=({date='2026-10-10',wrongQuestions=[],history=[],answers=[],powerBoost=true}={})=>buildAdaptiveTask({date,questions:bank,enabled:points,checkins,stats,wrongQuestions,history,answers,powerBoost});

let selected=task();
assert.equal(selected.questionIds.length,10);
assert.equal(boostItems(selected).length,3,'无错题回炉时应安排 3 道主动幂强化题');
assert.equal(boostItems(selected).filter(item=>highIds.has(item.questionId)).length,2,'三道主动强化题中应优先安排两道高优先级综合题');
assert.equal(selected.items.filter(item=>item.sourceType==='weakness').length,5,'强化不得改变 5 道弱项位');

selected=buildAdaptiveTask({date:'2026-10-10',questions:bank,enabled:points,checkins:[],stats,wrongQuestions:[],history:[],answers:[],powerBoost:true});
assert.equal(boostItems(selected).length,3,'强化启用后的首个诊断打卡日也应安排 3 道强化题');

selected=task({wrongQuestions:[wrong('Q0183')]});
assert.equal(powerReviews(selected).length,1,'幂运算错题必须优先回炉');
assert.equal(boostItems(selected).length,2,'已有 1 道幂运算回炉时应补 2 道强化题');

selected=task({wrongQuestions:[wrong('Q0183'),wrong('Q0184')]});
assert.equal(powerReviews(selected).length,2);
assert.equal(boostItems(selected).length,1,'已有 2 道幂运算回炉时应补 1 道强化题');

selected=task({wrongQuestions:[wrong('Q0183'),wrong('Q0184'),wrong('Q0186')]});
assert.equal(powerReviews(selected).length,2,'既有回炉上限仍为 2 道');
assert.equal(boostItems(selected).length,0,'已有至少 3 道到期幂运算错题时不得额外主动强化');

selected=task({wrongQuestions:[wrong('Q0001'),wrong('Q0002')]});
assert.deepEqual(selected.items.filter(item=>item.sourceType==='wrong_review').map(item=>item.questionId),['Q0001','Q0002'],'其他知识点错题回炉不得被幂强化挤掉');
assert.equal(boostItems(selected).length,3);

selected=task({history:[{questionId:'Q0183',shownCount:1,lastShownDate:'2026-10-09'}]});
assert.equal(boostItems(selected).some(item=>item.questionId==='Q0183'),false,'昨天刚主动强化的题不得再次优先出现');

const answers=[{questionId:'Q0183',date:'2026-10-01',firstAttemptCorrect:true},{questionId:'Q0183',date:'2026-10-02',firstAttemptCorrect:true},{questionId:'Q0184',date:'2026-10-01',firstAttemptCorrect:true},{questionId:'Q0184',date:'2026-10-02',firstAttemptCorrect:true},{questionId:'Q0184',date:'2026-10-03',firstAttemptCorrect:true}];
assert.equal(powerBoostStatus('Q0183',answers),'normal','连续正确 2 次应降为普通强化权重');
assert.equal(powerBoostStatus('Q0184',answers),'excluded','连续正确 3 次应退出主动强化');
assert.equal(powerBoostStatus('Q0184',[...answers,{questionId:'Q0184',date:'2026-10-04',firstAttemptCorrect:false}]),'priority','再次答错必须恢复强化资格');
assert.equal(powerBoostActive(13,0),true);
assert.equal(powerBoostActive(POWER_BOOST_DAYS,0),false,'第 15 个打卡日必须恢复正常选题');
assert.equal(boostItems(task({powerBoost:false})).length,0,'强化关闭时必须保持修改前行为');

let history=[];const boostCounts=[];for(let day=0;day<30;day++){const date=`2026-11-${String(day+1).padStart(2,'0')}`,current=task({date,history,powerBoost:powerBoostActive(day,0)}),boost=boostItems(current);boostCounts.push(boost.length);for(const item of boost){const index=history.findIndex(row=>row.questionId===item.questionId);if(index>=0){history[index]={...history[index],shownCount:history[index].shownCount+1,lastShownDate:date}}else history.push({questionId:item.questionId,shownCount:1,lastShownDate:date})}}
assert.equal(boostCounts.slice(0,14).reduce((a,b)=>a+b,0)/14,3,'前 14 个强化打卡日应平均每天 3 道主动强化题');
assert.ok(boostCounts.slice(14).every(count=>count===0),'第 15 个打卡日后不得继续主动强化');
console.log('Power boost scenarios passed: 14 active check-in days, stable 3-question exposure, then normal selection.');
