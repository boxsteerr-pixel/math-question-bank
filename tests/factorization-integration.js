import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildAdaptiveTask} from '../js/questionEngine.js';
import {afterWrong} from '../js/wrongQuestions.js';
import {FIXED_QUESTION_IDS,QUESTION_BANK_FIX_VERSION} from '../js/questionBankFix.js';
import {FACTORIZATION_POINTS,includeNewKnowledgePoints} from '../js/knowledgePoints.js';

const bank=JSON.parse(fs.readFileSync(new URL('../data/questions.json',import.meta.url),'utf8'));
const additions=bank.filter(question=>Number(question.id.slice(1))>=163&&Number(question.id.slice(1))<=179);
const pending=JSON.parse(fs.readFileSync(new URL('../data/questions_pending.json',import.meta.url),'utf8'));
const points=[...new Set(additions.map(question=>question.knowledgePoint))];
assert.equal(additions.length,17);
const batch=pending.filter(question=>question.batchId==='factorization-supplement-01'),formalIds=new Set(bank.map(question=>question.id));
assert.equal(new Set(batch.map(question=>question.candidateId)).size,batch.length,'pending candidateId 必须唯一');
assert.ok(batch.every(question=>!question.id&&!formalIds.has(question.candidateId)),'pending candidateId 不得充当正式 questionId');
assert.deepEqual(batch.filter(question=>question.status==='deferred').map(question=>question.candidateId),Array.from({length:13},(_,index)=>`CAND-FS01-${String(index+1).padStart(3,'0')}`),'13 道选择题候选必须暂缓入库');
assert.deepEqual(batch.filter(question=>question.status==='promoted').map(question=>[question.originalCandidateId,question.finalId]),additions.map((question,index)=>[`Q${String(176+index).padStart(4,'0')}`,question.id]),'已提升候选必须保留原候选编号到正式 ID 的映射');
assert.ok(batch.filter(question=>question.status==='promoted').every(question=>question.finalId!==question.proposedId),'promotion 不得直接复用过期 proposedId');
assert.deepEqual(points,['因式分解·提公因式法','因式分解·平方差公式','因式分解·完全平方公式','因式分解·综合方法']);
assert.deepEqual(FACTORIZATION_POINTS,points);
assert.ok(FACTORIZATION_POINTS.every(point=>includeNewKnowledgePoints(['相反数','绝对值','去括号','添括号','合并同类项','整式加减综合']).includes(point)),'旧设备的既有学习范围必须自动纳入新知识点');

const stats=points.map(knowledgePoint=>({knowledgePoint,attempts:0,firstCorrect:0,last20Attempts:[],recentAccuracy:0,consecutiveWrong:0,historicalWrong:0}));
const diagnosticTask=buildAdaptiveTask({date:'2026-10-01',questions:additions,enabled:points,checkins:[],stats,wrongQuestions:[],history:[]});
assert.equal(diagnosticTask.questionIds.length,10,'诊断期的新知识点必须能进入每日任务');
assert.ok(diagnosticTask.questionIds.every(id=>Number(id.slice(1))>=163));

const oldPoints=[...new Set(bank.slice(0,162).map(question=>question.knowledgePoint))];
const matureStats=[...oldPoints.map(knowledgePoint=>({knowledgePoint,attempts:10,firstCorrect:9,last20Attempts:Array(10).fill(true),recentAccuracy:90,consecutiveWrong:0,historicalWrong:1})),...stats];
const checkins=Array.from({length:5},(_,index)=>({date:`2026-09-${String(index+1).padStart(2,'0')}`}));
const matureTask=buildAdaptiveTask({date:'2026-10-01',questions:bank,enabled:[...oldPoints,...points],checkins,stats:matureStats,wrongQuestions:[],history:[]});
const exposures=matureTask.items.filter(item=>item.selectionReason==='unseen_knowledge_exposure');
assert.equal(exposures.length,1,'有零样本知识点时，每日最多曝光 1 题');
assert.equal(exposures[0].sourceType,'review');
assert.ok(points.includes(exposures[0].targetKnowledgePoint));
assert.equal(matureTask.items.filter(item=>item.sourceType==='weakness'&&points.includes(item.targetKnowledgePoint)).length,0,'零样本知识点不得被判为 weakness');

const sampledStats=[...oldPoints.map(knowledgePoint=>({knowledgePoint,attempts:10,firstCorrect:9,last20Attempts:Array(10).fill(true),recentAccuracy:90,consecutiveWrong:0,historicalWrong:1})),...points.map((knowledgePoint,index)=>({knowledgePoint,attempts:index===0?1:0,firstCorrect:index===0?1:0,last20Attempts:index===0?[true]:[],recentAccuracy:index===0?100:0,consecutiveWrong:0,historicalWrong:0}))];
const nextTask=buildAdaptiveTask({date:'2026-10-02',questions:bank,enabled:[...oldPoints,...points],checkins,stats:sampledStats,wrongQuestions:[],history:[]});
assert.notEqual(nextTask.items.find(item=>item.selectionReason==='unseen_knowledge_exposure')?.targetKnowledgePoint,points[0],'已获得样本的知识点不得持续按 unseen 优先');

const due=[afterWrong({questionId:'Q0001'},'2026-09-30'),afterWrong({questionId:'Q0002'},'2026-09-30')],coveredStats=[...oldPoints.map(knowledgePoint=>({knowledgePoint,attempts:10,firstCorrect:9,last20Attempts:Array(10).fill(true),recentAccuracy:90,consecutiveWrong:0,historicalWrong:1})),...points.map(knowledgePoint=>({knowledgePoint,attempts:1,firstCorrect:1,last20Attempts:[true],recentAccuracy:100,consecutiveWrong:0,historicalWrong:0}))],coveredTask=buildAdaptiveTask({date:'2026-10-02',questions:bank,enabled:[...oldPoints,...points],checkins,stats:coveredStats,wrongQuestions:due,history:[]});
assert.equal(coveredTask.items.filter(item=>item.sourceType==='wrong_review').length,2,'wrong_review 两题逻辑不得改变');
assert.equal(coveredTask.items.filter(item=>item.sourceType==='weakness').length,5,'weakness 五题逻辑不得改变');
assert.equal(coveredTask.items.filter(item=>item.sourceType==='review').length,3,'没有零样本时必须保留三道普通 review');
assert.equal(coveredTask.items.some(item=>item.selectionReason==='unseen_knowledge_exposure'),false,'没有零样本时不得触发 unseen exposure');
assert.equal(coveredTask.questionIds.length,10);

const wrong=afterWrong({questionId:'Q0163'},'2026-10-01');
const reviewTask=buildAdaptiveTask({date:'2026-10-02',questions:additions,enabled:points,checkins,stats,wrongQuestions:[wrong],history:[]});
assert.ok(reviewTask.items.some(item=>item.questionId==='Q0163'&&item.sourceType==='wrong_review'),'新增题错误后必须能进入 D+1 回炉');

assert.equal(QUESTION_BANK_FIX_VERSION,2,'新增题不得提高既有题库修复 migration 版本');
for(const question of additions)assert.equal(FIXED_QUESTION_IDS.has(question.id),false,`${question.id} 是新增题，不得触发旧题强制同步 migration`);
console.log('Factorization integration scenarios passed.');
