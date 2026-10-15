import {normalizeMathInput} from './formatMath.js';

export const FACTORIZED_FORM_LIMITS=Object.freeze({inputLength:2048,depth:48,nodes:512,exponent:32,factors:256,terms:1024,operations:100000,numberDigits:64,coefficientBits:4096});
class FormLimit extends Error {}
const fail=message=>{throw new FormLimit(message)};
const gcd=(a,b)=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b)[a,b]=[b,a%b];return a};
const rational=(n,d=1n)=>{
  if(!d)fail('zero_denominator');if(d<0n){n=-n;d=-d}
  if(n.toString(2).length>FACTORIZED_FORM_LIMITS.coefficientBits||d.toString(2).length>FACTORIZED_FORM_LIMITS.coefficientBits)fail('coefficient_limit');
  const g=gcd(n,d);return [n/g,d/g];
};
const plus=(a,b)=>rational(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);
const times=(a,b)=>rational(a[0]*b[0],a[1]*b[1]);
const divide=(a,b)=>rational(a[0]*b[1],a[1]*b[0]);
const ratString=a=>`${a[0]}/${a[1]}`;
const unit=()=>new Map([['',rational(1n)]]);

// Preserve multiplication/power structure; do not infer a factorization by
// expanding a student's top-level sum. Numeric rational denominators only.
export function parseFactorizedForm(input){
  if(typeof input!=='string'||input.length>FACTORIZED_FORM_LIMITS.inputLength)fail('input_length_limit');
  const s=normalizeMathInput(input).replace(/[\s，。；;]/g,'').replace(/[\[{]/g,'(').replace(/[\]}]/g,')');
  if(s.length>FACTORIZED_FORM_LIMITS.inputLength)fail('input_length_limit');
  if(/(?:sqrt|sin|cos|tan|log|abs)\(/i.test(s))fail('unsupported_function');
  const tokens=s.match(/\d+(?:\.\d+)?|[a-zA-Z]|[+*/^()\-]/g)||[];
  if(tokens.join('')!==s)fail('unsupported_token');
  let p=0,nodes=0,depth=0;
  function node(op,parts={}){if(++nodes>FACTORIZED_FORM_LIMITS.nodes)fail('node_limit');const h=1+Math.max(parts.left?.height||0,parts.right?.height||0,parts.base?.height||0);if(h>FACTORIZED_FORM_LIMITS.depth)fail('ast_depth_limit');return {op,...parts,height:h}}
  const starts=()=>/^(?:\d+(?:\.\d+)?|[a-zA-Z]|\()$/.test(tokens[p]||'');
  function expression(){if(++depth>FACTORIZED_FORM_LIMITS.depth)fail('parse_depth_limit');let a=product();while(['+','-'].includes(tokens[p])){const op=tokens[p++];a=node(op,{left:a,right:product()})}depth--;return a}
  function product(){let a=factor();while(['*','/'].includes(tokens[p])||starts()){const op=['*','/'].includes(tokens[p])?tokens[p++]:'*';a=node(op,{left:a,right:factor()})}return a}
  function factor(){let sign=1;while(['+','-'].includes(tokens[p]))if(tokens[p++]==='-')sign=-sign;let a;const t=tokens[p++];
    if(/^\d/.test(t||'')){if(t.replace('.','').length>FACTORIZED_FORM_LIMITS.numberDigits)fail('number_digit_limit');const [whole,fraction='']=t.split('.');a=node('number',{value:rational(BigInt(whole+fraction),10n**BigInt(fraction.length))})}
    else if(/^[a-zA-Z]$/.test(t||''))a=node('variable',{name:t.toLowerCase()});
    else if(t==='('){a=expression();if(tokens[p++]!==')')fail('unclosed_bracket')}
    else fail('unsupported_factor');
    if(tokens[p]==='^'){p++;let n;if(tokens[p]==='('){p++;n=tokens[p++];if(tokens[p++]!==')')fail('unsupported_exponent')}else n=tokens[p++];if(!/^\d+$/.test(n||'')||Number(n)>FACTORIZED_FORM_LIMITS.exponent)fail('unsupported_exponent');a=node('power',{base:a,exponent:Number(n)})}
    return sign<0?node('negative',{base:a}):a;
  }
  const ast=expression();if(p!==tokens.length)fail('expression_tail');return ast;
}
const constant=p=>p.size===0||(p.size===1&&p.has(''));
const containsVariable=ast=>ast.op==='variable'||Boolean(ast.base&&containsVariable(ast.base))||Boolean(ast.left&&containsVariable(ast.left))||Boolean(ast.right&&containsVariable(ast.right));
function budget(){let remaining=FACTORIZED_FORM_LIMITS.operations;return ()=>{if(--remaining<0)fail('operation_limit')}}
function add(a,b){const out=new Map(a);for(const[key,c]of b){const value=plus(out.get(key)||rational(0n),c);if(value[0])out.set(key,value);else out.delete(key)}if(out.size>FACTORIZED_FORM_LIMITS.terms)fail('term_limit');return out}
const scale=(p,c)=>new Map([...p].map(([key,v])=>[key,times(v,c)]).filter(([,v])=>v[0]));
function multiply(a,b,tick){const out=new Map;for(const[ka,ca]of a)for(const[kb,cb]of b){tick();const powers={};for(const key of [ka,kb])for(const term of key?key.split('*'):[]){const[v,n]=term.split('^');powers[v]=(powers[v]||0)+Number(n)}const key=Object.keys(powers).sort().map(v=>`${v}^${powers[v]}`).join('*');const c=plus(out.get(key)||rational(0n),times(ca,cb));if(c[0])out.set(key,c);else out.delete(key);if(out.size>FACTORIZED_FORM_LIMITS.terms)fail('term_limit')}return out}
function polynomial(ast,tick){tick();switch(ast.op){
  case 'number':return ast.value[0]?new Map([['',ast.value]]):new Map;
  case 'variable':return new Map([[`${ast.name}^1`,rational(1n)]]);
  case 'negative':return scale(polynomial(ast.base,tick),rational(-1n));
  case '+':return add(polynomial(ast.left,tick),polynomial(ast.right,tick));
  case '-':return add(polynomial(ast.left,tick),scale(polynomial(ast.right,tick),rational(-1n)));
  case '*':return multiply(polynomial(ast.left,tick),polynomial(ast.right,tick),tick);
  case '/':{if(containsVariable(ast.right))fail('symbolic_denominator');const b=polynomial(ast.right,tick);if(b.size!==1||!b.has(''))fail('symbolic_denominator');return scale(polynomial(ast.left,tick),divide(rational(1n),b.get('')))}
  case 'power':{let out=unit();const base=polynomial(ast.base,tick);if(!ast.exponent&&!base.size)fail('indeterminate_zero_power');for(let i=0;i<ast.exponent;i++){tick();out=multiply(out,base,tick)}return out}
  default:fail('invalid_ast');
}}
const rows=p=>[...p].sort(([a],[b])=>a.localeCompare(b));
const exact=p=>JSON.stringify(rows(p).map(([key,c])=>[key,ratString(c)]));
function primitive(p){if(!p.size)fail('zero_factor');const sorted=rows(p),lead=sorted[0][1];return sorted.map(([key,c])=>`${key}:${ratString(divide(c,lead))}`).join('|')}
export function normalizeFactorMultiset(ast,tick=budget()){
  const factors=[];
  function visit(a){tick();if(a.op==='negative')return visit(a.base);if(a.op==='*'){visit(a.left);visit(a.right);return}
    if(a.op==='/'){if(!constant(polynomial(a.right,tick)))fail('symbolic_denominator');return visit(a.left)}
    if(a.op==='power'){for(let i=0;i<a.exponent;i++)visit(a.base);return}
    const p=polynomial(a,tick);if(!constant(p)){if(factors.length>=FACTORIZED_FORM_LIMITS.factors)fail('factor_limit');factors.push(primitive(p))}
  }
  visit(ast);return factors.sort();
}
export function checkFullyFactoredForm(input,answer,{fullyFactored=false}={}){
  try{
    if(fullyFactored!==true)return {correct:false,manualCheck:true,reason:'uncertified_factor_reference'};
    const student=parseFactorizedForm(input),reference=parseFactorizedForm(answer),tick=budget();
    // Exact equivalence with bounded evaluation; never call the unbounded legacy
    // evaluator on constrained inputs such as variable/fractional exponents.
    const target=polynomial(reference,tick);
    if(constant(target))return {correct:false,manualCheck:true,reason:'constant_reference'};
    if(exact(polynomial(student,tick))!==exact(target))return {correct:false,reason:'algebraically_not_equivalent'};
    const expected=normalizeFactorMultiset(reference,tick);
    if(reference.op==='+'||reference.op==='-'||expected.length<2)return {correct:false,manualCheck:true,reason:'special_or_unreliable_reference_structure'};
    if(student.op==='+'||student.op==='-')return {correct:false,reason:'top_level_sum'};
    const actual=normalizeFactorMultiset(student,tick);
    return JSON.stringify(actual)===JSON.stringify(expected)?{correct:true}:{correct:false,reason:'unfinished_factor_structure'};
  }catch(error){if(error instanceof FormLimit||error instanceof RangeError||error instanceof SyntaxError)return {correct:false,manualCheck:true,reason:error.message};throw error}
}
