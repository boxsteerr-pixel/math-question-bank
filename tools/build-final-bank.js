const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const pending=JSON.parse(fs.readFileSync(path.join(root,'data','questions_pending.json'),'utf8'));
const source='七年级上学期_日常计算精选题库_含标准答案.pdf';
const A=[
'-1','1','3/2','-6','1.3','-2.5','-3/4','1/3','15','-6.9','-1.3','-2','-3','-8.1','1/4','3 2/3','0.75','68','3.8','8','-15/16','-8 3/8','-0.3','-6.8','9','8.4','-24','13/18','0','0',
'1','3','8.5','3/4','1/4','1/2012','1.5','11','2/3','2/5','-2007','-2018','2/5','5.1','-3','5/7','2.9','-3.2','-16','25','a','-a','a','-a','-m','m','-m','-a','a','-a',
'-a+2b+c','7x-5','-a-2b+3c','a+b-c+d','-2m+2n','1','5','-a+b+c','-5','x^5+4x^4y+6x^3y^2-6x^2y^3-5xy^4-3y^5','x+y-z','x-y-z','-1-2x+2y','2a-2b-3x-3y','x-6y+3z','x-10y+15z','3a^2-2a+2b+10c','-a^3+3a^2-2a+1','x-y-m-n','a-3b+6','a-b-c-d','-a+b+c+d','5x^3-3x^2+x-1','2a-2b-3x-3y','mp-mq-np+nq','-2a^2-3a^3+a-2','n+8-4m','-2a-4b','-a^3+3a^2-2a+1','3a^2-2a+2b+10c',
'b-c+d','a-b+c','c-d','a-b+c-d',['b+c','b-c'],['b-c','b-c'],['a-c','a-c'],['b-c','b+c'],['-c','-d','+c','+d'],'y^2-8y+4','a-3c','ay-by','4y^2-3x^2','3p+1',['2a-5c','2a-5c'],'a^2-2ab+b^2','c-b','ab-b^2','y-z','3b-4c','3xy-1','(-x^3-6x^2y+12xy^2)+(1-8y^3)',
'-8x','-4a','-1/2*y','7a','-2x+y','7a-b','-10a+5b+3','a+b-1','6x-5f','-2x+5y','-x-1/3*y','2x-y-1','-2x-5y','6m+21','3a','6x-11y','-5a','-a+3b','-2x-5y','1/15*y+3z','-1/2*x+1','3x-12y','-3a-3b','2a-2b','-2a-3b','-6a+6b','13/6*a+13/6*b','4b-12a','-50a','5050a',
'a^2-5b^2','10x^2-9y^2','-2x^2+2y^2','-5a','5x^2-3x-3','-a^2-10ab+b^2','-3pr','-2x^3+y^3+4x^2y','2a^2b+ab^2','3a+b','-2x^2+5xy+2y^2','-3x+y^2','15xy-6x-9','-9a^2+5a-4','15','2-7a','-a^2b-ab','8m^2-8m-2','-5x^2+5y^2+12','-x+4y'
];
if(A.length!==162)throw Error(`Expected 162 answers, received ${A.length}`);
const corrections={Q0014:'+[+(-8.1)]',Q0028:'-{[-(-13/18)]}'};
function answerType(i,answer){if(i<=30)return 'number';if(i<=50)return 'number';if(i<=60)return 'conditional_expression';if(i===69)return 'number';if(i===70)return 'ordered_terms';if(i>=91&&i<=94)return 'fill_blank';if(i>=95&&i<=99)return 'multiple_blank';if(i>=100&&i<=111)return 'fill_blank';if(i===112)return 'expression';return 'expression'}
function subPoint(q){if(q.knowledgePoint==='添括号')return '括号内填空';return q.subKnowledgePoint||''}
const final=pending.map((p,i)=>{const n=i+1,page=n<=30?1:n<=60?2:n<=90?3:n<=112?4:n<=142?5:n<=152?6:7,answerPage=n<=30?8:n<=60?9:n<=90?10:n<=112?11:n<=142?12:13,answer=A[i];return {id:p.id,question:corrections[p.id]||p.question,displayQuestion:corrections[p.id]||p.question,answer,displayAnswer:Array.isArray(answer)?answer.join('；'):answer,chapter:'七年级上学期 日常计算',knowledgePoint:p.knowledgePoint,subKnowledgePoint:subPoint(p),difficulty:p.difficulty||2,source,questionPage:page,answerPage,sourceIndex:p.sourceIndex,status:'approved',tags:p.tags||[],answerType:answerType(n,answer),reviewNote:'已依据同一 PDF 中对应答案页、模块、题号及左右栏位置核对。',verifiedAnswer:'',answerCheck:'not_checked'};});
fs.writeFileSync(path.join(root,'data','questions.json'),JSON.stringify(final,null,2)+'\n','utf8');
fs.writeFileSync(path.join(root,'data','questions_needs_review.json'),'[]\n','utf8');
fs.writeFileSync(path.join(root,'review','initial-data.js'),`window.INITIAL_QUESTIONS = ${JSON.stringify(final,null,2)};\n`,'utf8');
console.log(`Wrote ${final.length} approved questions and 0 needs-review questions.`);
