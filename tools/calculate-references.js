/* Deterministic reference-answer pass. It never edits question, answer, or status. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pendingPath = path.join(root, 'data', 'questions_pending.json');
const questions = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));

function gcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){[a,b]=[b,a%b]}return a||1n}
function rat(n,d=1n){if(d===0n)throw Error('division by zero');if(d<0n){n=-n;d=-d}const g=gcd(n,d);return [n/g,d/g]}
function radd(a,b){return rat(a[0]*b[1]+b[0]*a[1],a[1]*b[1])} function rneg(a){return[-a[0],a[1]]}
function rmul(a,b){return rat(a[0]*b[0],a[1]*b[1])} function rdiv(a,b){return rat(a[0]*b[1],a[1]*b[0])}
const zero=()=>new Map(); const scalar=r=>new Map([['',r]]); const clone=p=>new Map(p);
function mono(key){return key?key.split('*').reduce((m,t)=>{const [v,e]=t.split('^');m[v]=(m[v]||0)+Number(e||1);return m},{}):{}}
function keyOf(m){return Object.keys(m).sort().map(v=>m[v]===1?v:`${v}^${m[v]}`).join('*')}
function add(a,b){const o=clone(a);for(const[k,v]of b){const z=radd(o.get(k)||[0n,1n],v);if(z[0])o.set(k,z);else o.delete(k)}return o}
function neg(a){const o=zero();for(const[k,v]of a)o.set(k,rneg(v));return o} function sub(a,b){return add(a,neg(b))}
function mul(a,b){const o=zero();for(const[ka,va]of a)for(const[kb,vb]of b){const m=mono(ka);for(const[v,e]of Object.entries(mono(kb)))m[v]=(m[v]||0)+e;const k=keyOf(m),z=radd(o.get(k)||[0n,1n],rmul(va,vb));if(z[0])o.set(k,z);else o.delete(k)}return o}
function pow(a,n){if(!Number.isInteger(n)||n<0||n>20)throw Error('unsupported exponent');let o=scalar([1n,1n]);while(n--)o=mul(o,a);return o}
function divide(a,b){if(b.size!==1||!b.has(''))throw Error('only division by a number is supported');const o=zero();for(const[k,v]of a)o.set(k,rdiv(v,b.get('')));return o}
function tokenize(s){const out=[];let i=0;while(i<s.length){const c=s[i];if(/\s/.test(c)){i++;continue}if(/[0-9.]/.test(c)){let j=i+1;while(/[0-9.]/.test(s[j]||''))j++;const t=s.slice(i,j);if((t.match(/\./g)||[]).length>1)throw Error('bad number');out.push({t:'n',v:t});i=j;continue}if(/[a-zA-Z]/.test(c)){out.push({t:'v',v:c.toLowerCase()});i++;continue}if('+-*/^()'.includes(c)){out.push({t:c});i++;continue}throw Error(`unsupported token ${c}`)}return out}
function parsePoly(s){const ts=tokenize(s.replace(/[\[\{]/g,'(').replace(/[\]\}]/g,')'));let p=0;const starts=()=>['n','v','('].includes(ts[p]?.t);function expr(){let a=term();while(['+','-'].includes(ts[p]?.t)){const op=ts[p++].t,b=term();a=op==='+'?add(a,b):sub(a,b)}return a}function term(){let a=factor();while(ts[p]?.t==='*'||ts[p]?.t==='/'||starts()){const op=ts[p]?.t==='*'||ts[p]?.t==='/'?ts[p++].t:'*';const b=factor();a=op==='*'?mul(a,b):divide(a,b)}return a}function factor(){let sign=1;if(ts[p]?.t==='+'||ts[p]?.t==='-')sign=ts[p++].t==='-'?-1:1;let a;if(ts[p]?.t==='n'){const n=ts[p++].v;if(n.includes('.')){const [x,y]=n.split('.');a=scalar(rat(BigInt((x||'0')+y),10n**BigInt(y.length)))}else a=scalar([BigInt(n),1n])}else if(ts[p]?.t==='v')a=new Map([[ts[p++].v,[1n,1n]]]);else if(ts[p]?.t==='('){p++;a=expr();if(ts[p]?.t!==')')throw Error('unclosed bracket');p++}else throw Error('missing factor');if(ts[p]?.t==='^'){p++;if(ts[p]?.t!=='n')throw Error('non-integer exponent');a=pow(a,Number(ts[p++].v))}return sign<0?neg(a):a}const out=expr();if(p!==ts.length)throw Error('trailing input');return out}
function fmtRat(r){return r[1]===1n?String(r[0]):`${r[0]}/${r[1]}`} function degree(k){return Object.values(mono(k)).reduce((a,b)=>a+b,0)}
function format(p){if(!p.size)return '0';const terms=[...p.entries()].sort(([a],[b])=>degree(b)-degree(a)||a.localeCompare(b));return terms.map(([k,r],i)=>{const neg=r[0]<0n,abs=neg?[-r[0],r[1]]:r;let body;if(!k)body=fmtRat(abs);else {const c=abs[1]===1n&&abs[0]===1n?'':abs[1]===1n?String(abs[0]):`${abs[0]}/${abs[1]}*`;body=c+k.replace(/\*/g,'*')}return `${i?(neg?'-':'+'):(neg?'-':'')}${body}`}).join('')}
function numericWithAbs(s){let x=s.replace(/\s/g,'');let guard=0;while(x.includes('|')){if(++guard>20)throw Error('unmatched absolute value');const next=x.replace(/\|([^|]+)\|/,(_,inner)=>{const v=parsePoly(inner);if([...v.keys()].some(k=>k))throw Error('variable in absolute value');const r=v.get('')||[0n,1n];return `(${fmtRat(r[0]<0n?rneg(r):r)})`});if(next===x)throw Error('unmatched absolute value');x=next}return format(parsePoly(x))}
function expressionFor(q){
  const text=q.question;
  if(q.id==='Q0069')return '-(-a)';
  if(q.id==='Q0070')return 'x^5-(-4x^4y+5xy^4)-6(-x^3y^2+x^2y^3)+(-3y^5)';
  if(q.id==='Q0155')return '3*(2x^2+3xy-2x-1)+6*(-x^2+xy-1)';
  if(q.id==='Q0156')return '2*(3a^2-2a+1)-3*(5a^2-3a+2)';
  const colon=text.lastIndexOf('：'); if(colon>=0)return text.slice(colon+1).replace(/[。；]$/,'').trim();
  return null;
}
function sourceConfidence(q){
  const n=Number(q.id.slice(1));
  if(n>=143)return 'low'; // two scanned, low-contrast source pages
  if([15,16,28,30,95,96,141,142].includes(n))return 'medium'; // dense nested signs, a crowded fill-in, or ellipsis structure
  return 'high';
}
function conditionAnswer(q){const n=Number(q.id.slice(1));return ({51:'a',52:'-a',53:'a',54:'-a',55:'-m',56:'m',57:'-m',58:'-a',59:'a',60:'-a'})[n]||null}
function compute(q){
  const source=q.sourceConfidence;
  if(source==='low')return ['', 'low', '题面来自较淡扫描页；按规则不自动计算，需回看 PDF 原图。'];
  if(q.knowledgePoint==='添括号')return ['', source==='high'?'low':'low', '题目要求填写括号或缺失项；可能存在多个等价表达，需人工确认。'];
  const conditional=conditionAnswer(q); if(conditional)return [conditional, source==='high'?'high':'medium', '按题目给定的不等式条件，使用绝对值定义计算。'];
  let expr=expressionFor(q); if(!expr)return ['', 'low', '未能从题干中安全分离可计算表达式。'];
  if(expr.includes('…')||expr.includes('______'))return ['', 'low', '题目包含省略号或待填空，无法建立唯一的可计算表达式。'];
  try {const ans=expr.includes('|')?numericWithAbs(expr):format(parsePoly(expr));return [ans,source==='high'?'high':'medium','使用有理系数多项式解析、括号展开与同类项合并计算；不是 PDF 官方答案。'];}
  catch(e){return ['', 'low',`无法可靠解析：${e.message}。`];}
}
for(const q of questions){q.calculatedAnswer='';q.answerConfidence='low';q.calculationNote='';q.sourceConfidence=sourceConfidence(q);const [answer,confidence,note]=compute(q);q.calculatedAnswer=answer;q.answerConfidence=confidence;q.calculationNote=note;}
fs.writeFileSync(pendingPath,JSON.stringify(questions,null,2)+'\n','utf8');
fs.writeFileSync(path.join(root,'data','questions_needs_review.json'),JSON.stringify(questions.filter(q=>q.status==='needsReview'),null,2)+'\n','utf8');
fs.writeFileSync(path.join(root,'review','initial-data.js'),`window.INITIAL_QUESTIONS = ${JSON.stringify(questions,null,2)};\n`,'utf8');
const report={source:{high:0,medium:0,low:0},answer:{high:0,medium:0,low:0},uncomputed:0};for(const q of questions){report.source[q.sourceConfidence]++;report.answer[q.answerConfidence]++;if(!q.calculatedAnswer)report.uncomputed++;}console.log(JSON.stringify(report,null,2));
