import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pending=JSON.parse(fs.readFileSync(path.join(root,'data','questions_pending.json'),'utf8'));
const factorizationBatch=pending.filter(question=>question.batchId==='factorization-supplement-01');
for(const [index,candidate] of factorizationBatch.entries()){
  const originalCandidateId=candidate.originalCandidateId||candidate.id;
  if(!originalCandidateId)throw Error('Factorization candidate is missing its original candidate ID');
  candidate.originalCandidateId=originalCandidateId;
  candidate.proposedId=candidate.proposedId||originalCandidateId;
  candidate.candidateId=candidate.candidateId||`CAND-FS01-${String(index+1).padStart(3,'0')}`;
  delete candidate.id;
}
if(new Set(factorizationBatch.map(candidate=>candidate.candidateId)).size!==factorizationBatch.length)throw Error('Factorization candidateId values must be unique');
const basePending=pending.filter(question=>!question.batchId);
const source='七年级上学期_日常计算精选题库_含标准答案.pdf';
const A=[
'-1','1','3/2','-6','1.3','-2.5','-3/4','1/3','15','-6.9','-1.3','-2','-3','-8.1','1/4','3 2/3','0.75','68','3.8','8','-15/16','-8 3/8','-0.3','-6.8','9','8.4','-24','13/18','0','0',
'1','3','8.5','3/4','1/4','1/2012','1.5','11','2/3','2/5','-2007','-2018','2/5','5.1','-3','5/7','2.9','-3.2','-16','25','a','-a','a','-a','-m','m','-m','-a','a','-a',
'-a+2b+c','7x-5','-a-2b+3c','a+b-c+d','-2m+2n','1','5','-a+b+c','-5','x^5+4x^4y+6x^3y^2-6x^2y^3-5xy^4-3y^5','x+y-z','x-y-z','-1-2x+2y','2a-2b-3x-3y','x-6y+3z','x-10y+15z','3a^2-2a+2b+10c','-a^3+3a^2-2a+1','x-y-m-n','a-3b+6','a-b-c-d','-a+b+c+d','5x^3-3x^2+x-1','2a-2b-3x-3y','mp-mq-np+nq','-2a^2-3a^3+a-2','n+8-4m','-2a-4b','-a^3+3a^2-2a+1','3a^2-2a+2b+10c',
'b-c+d','a-b+c','c-d','a-b+c-d',['b+c','b-c'],['b-c','b-c'],['a-c','a-c'],['b-c','b+c'],['-c','-d','+c','+d'],'y^2-8y+4','a-3c','ay-by','4y^2-3x^2','3p+1',['2a-5c','2a-5c'],'a^2-2ab+b^2','c-b','ab-b^2','y-z','3b-4c','3xy-1','(-x^3-6x^2y+12xy^2)+(1-8y^3)',
'-8x','-4a','-1/2*y','7a','-2x+y','7a-b','-10a+5b+3','a+b-1','6x-5f','-2x+5y','-x-1/3*y','2x-y-1','-2x-5y','6m+21','3a','6x-11y','-5a','-a+3b','-2x-5y','1/15*y+3z','-1/2*x+1','3x-12y','-3a-3b','2a-2b','-2a-3b','-6a+6b','13/6*a+13/6*b','4b-12a','-50a','5050a',
'a^2-5b^2','10x^2-9y^2','-2x^2+2y^2','-5a','5x^2-3x-3','-a^2-10ab+b^2','-3pr','-2x^3+y^3+4x^2y','2a^2b+ab^2','3a+b','-2x^2+5xy+2y^2','-3x+y^2','15xy-6x-9','-9a^2+5a-4','15','2-7a','-a^2b-ab','8m^2-8m-2','-5x^2+5y^2+12','-x+4y'
];
if(A.length!==162||basePending.length!==162)throw Error(`Expected 162 original questions and answers, received ${basePending.length} questions and ${A.length} answers`);
// Keep audited corrections keyed by question ID. Do not add new positional answer edits to A.
const questionOverrides={Q0014:'+[+(-8.1)]'};
const answerOverrides={Q0024:'6.8',Q0125:'2x-5y',Q0137:'-2a-2b'};
function answerType(i,answer){if(i<=30)return 'number';if(i<=50)return 'number';if(i<=60)return 'conditional_expression';if(i===69)return 'number';if(i===70)return 'ordered_terms';if(i>=91&&i<=94)return 'fill_blank';if(i>=95&&i<=99)return 'multiple_blank';if(i>=100&&i<=111)return 'fill_blank';if(i===112)return 'expression';return 'expression'}
function subPoint(q){if(q.knowledgePoint==='添括号')return '括号内填空';return q.subKnowledgePoint||''}
const final=basePending.map((p,i)=>{const n=i+1,page=n<=30?1:n<=60?2:n<=90?3:n<=112?4:n<=142?5:n<=152?6:7,answerPage=n<=30?8:n<=60?9:n<=90?10:n<=112?11:n<=142?12:13,answer=answerOverrides[p.id]??A[i],question=questionOverrides[p.id]??p.question;return {id:p.id,question,displayQuestion:question,answer,displayAnswer:Array.isArray(answer)?answer.join('；'):answer,chapter:'七年级上学期 日常计算',knowledgePoint:p.knowledgePoint,subKnowledgePoint:subPoint(p),difficulty:p.difficulty||2,source,questionPage:page,answerPage,sourceIndex:p.sourceIndex,status:'approved',tags:p.tags||[],answerType:answerType(n,answer),reviewNote:'已依据同一 PDF 中对应答案页、模块、题号及左右栏位置核对。',verifiedAnswer:'',answerCheck:'not_checked'};});
// New questions are selected by immutable candidate IDs, never by pending-array position.
const factorizationPromotions=Object.freeze({
  Q0176:{finalId:'Q0163',knowledgePoint:'因式分解·提公因式法',subKnowledgePoint:'提公因式法'},
  Q0177:{finalId:'Q0164',knowledgePoint:'因式分解·平方差公式',subKnowledgePoint:'平方差公式'},
  Q0178:{finalId:'Q0165',knowledgePoint:'因式分解·完全平方公式',subKnowledgePoint:'完全平方公式'},
  Q0179:{finalId:'Q0166',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'提出负号后使用完全平方公式'},
  Q0180:{finalId:'Q0167',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'提公因式后使用平方差公式'},
  Q0181:{finalId:'Q0168',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'提公因式后使用完全平方公式'},
  Q0182:{finalId:'Q0169',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'提公因式后使用完全平方公式'},
  Q0183:{finalId:'Q0170',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'换元后使用平方差公式'},
  Q0184:{finalId:'Q0171',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'十字相乘法'},
  Q0185:{finalId:'Q0172',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'换元法'},
  Q0186:{finalId:'Q0173',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'换元法'},
  Q0187:{finalId:'Q0174',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'提出负号后分解二次三项式'},
  Q0188:{finalId:'Q0175',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'十字相乘法'},
  Q0189:{finalId:'Q0176',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'整体换元与十字相乘法'},
  Q0190:{finalId:'Q0177',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'分组分解法'},
  Q0191:{finalId:'Q0178',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'分组分解法'},
  Q0192:{finalId:'Q0179',knowledgePoint:'因式分解·综合方法',subKnowledgePoint:'分组分解法'}
});
const deferredCandidateIds=new Set(['Q0163','Q0164','Q0165','Q0166','Q0167','Q0168','Q0169','Q0170','Q0171','Q0172','Q0173','Q0174','Q0175']);
const pendingByOriginalCandidateId=new Map(factorizationBatch.map(question=>[question.originalCandidateId,question]));
for(const [candidateId,promotion] of Object.entries(factorizationPromotions)){
  const candidate=pendingByOriginalCandidateId.get(candidateId);
  if(!candidate)throw Error(`Missing promoted candidate ${candidateId}`);
  if(candidate.answerReviewStatus!=='verified')throw Error(`${candidateId} is not verified`);
  final.push({id:promotion.finalId,question:candidate.question,displayQuestion:candidate.displayQuestion||candidate.question,answer:candidate.answer,displayAnswer:candidate.displayAnswer||candidate.answer,chapter:candidate.chapter,knowledgePoint:promotion.knowledgePoint,subKnowledgePoint:promotion.subKnowledgePoint,difficulty:candidate.difficulty||2,source:candidate.source,questionPage:candidate.questionPage,answerPage:candidate.answerPage,sourceIndex:candidate.sourceIndex,status:'approved',tags:candidate.tags||[],answerType:'expression',reviewNote:`由候选题 ${candidateId} 提升；学生版题面、教师版答案及独立复核一致。`,verifiedAnswer:candidate.calculatedAnswer,answerCheck:'verified'});
}
if(final.length!==179||new Set(final.map(question=>question.id)).size!==179)throw Error('Expected 179 unique final questions');
for(const candidateId of deferredCandidateIds){const candidate=pendingByOriginalCandidateId.get(candidateId);if(!candidate)throw Error(`Missing deferred candidate ${candidateId}`);candidate.status='deferred';candidate.deferredReason='multiple_choice_not_enabled_in_daily_practice';}
for(const [candidateId,promotion] of Object.entries(factorizationPromotions)){const candidate=pendingByOriginalCandidateId.get(candidateId);candidate.status='promoted';candidate.finalId=promotion.finalId;}
fs.writeFileSync(path.join(root,'data','questions.json'),JSON.stringify(final,null,2)+'\n','utf8');
fs.writeFileSync(path.join(root,'data','questions_pending.json'),JSON.stringify(pending,null,2)+'\n','utf8');
fs.writeFileSync(path.join(root,'data','questions_needs_review.json'),'[]\n','utf8');
fs.writeFileSync(path.join(root,'review','initial-data.js'),`window.INITIAL_QUESTIONS = ${JSON.stringify(final,null,2)};\n`,'utf8');
console.log(`Wrote ${final.length} approved questions and 0 needs-review questions.`);
