const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const superscriptDigits={'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
const normalizeSuperscripts=value=>String(value??'').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g,run=>`^${[...run].map(char=>superscriptDigits[char]).join('')}`);
export function normalizeMathInput(value){let s=String(value??'').replace(/[−－]/g,'-').replace(/[＋]/g,'+').replace(/×/g,'*').replace(/[÷／⁄]/g,'/');s=s.replace(/[０-９]/g,char=>String.fromCharCode(char.charCodeAt(0)-0xFEE0));s=normalizeSuperscripts(s);return s.replace(/[［【{]/g,'(').replace(/[］】}]/g,')');}
function normalizeDisplay(value){let s=String(value??'').replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/');s=normalizeSuperscripts(s);return s.replace(/[［【]/g,'[').replace(/[］】]/g,']');}
function renderFractionExpression(source){
  if(source.length>180||!source.includes('/'))throw Error('not fraction');
  const tokens=source.match(/\d+(?:\.\d+)?|[A-Za-z]|[+\-*/^()]/g)||[];
  if(tokens.join('')!==source)throw Error('unsupported');
  let index=0,depth=0;
  const peek=()=>tokens[index];
  function expression(){
    let html=product();
    while(peek()==='+'||peek()==='-'){const op=tokens[index++];html+=op==='+'?' + ':' − ';html+=product()}
    return html;
  }
  function product(){
    let html=unary(),divided=false;
    while(peek()==='*'||peek()==='/'||/^(?:[A-Za-z]|\d+(?:\.\d+)?|\()$/.test(peek()||'')){
      const explicit=peek()==='*'||peek()==='/',op=explicit?tokens[index++]:'*';
      if(!explicit&&divided)throw Error('ambiguous');
      const right=unary();
      html=op==='/'?`<span class="math-fraction"><span class="math-numerator">${html}</span><span class="math-denominator">${right}</span></span>`:html+' × '+right;
      divided=op==='/';
    }
    return html;
  }
  function unary(){
    if(peek()==='+'||peek()==='-'){const op=tokens[index++];return (op==='-'?'−':'+')+unary()}
    const token=tokens[index++];let html;
    if(token==='('){if(++depth>20)throw Error('depth');html='('+expression()+')';if(tokens[index++]!==')')throw Error('bracket');depth--}
    else if(/^(?:\d+(?:\.\d+)?|[A-Za-z])$/.test(token||''))html=escapeHtml(token);
    else throw Error('syntax');
    if(peek()==='^'){
      index++;let exp='';
      if(peek()==='('){exp+='(';index++;if(peek()==='-'||peek()==='+')exp+=tokens[index++];exp+=tokens[index++]||'';if(tokens[index++]!==')')throw Error('exponent');exp+=')'}
      else{if(peek()==='-'||peek()==='+')exp+=tokens[index++];exp+=tokens[index++]||''}
      if(!/^\(?[+-]?\d+\)?$/.test(exp))throw Error('exponent');
      html+=`<sup class="math-exponent">${escapeHtml(exp.replace('-', '−'))}</sup>`;
    }
    return html;
  }
  const html=expression();if(index!==tokens.length)throw Error('syntax');return html;
}
export function formatMath(value){
  const source=normalizeDisplay(value).replace(/×/g,'*').replace(/÷/g,'/'),pattern=/[A-Za-z0-9+\-*/^().\[\]{}]+/g;
  let output='',offset=0;
  for(const match of source.matchAll(pattern)){
    output+=escapeHtml(source.slice(offset,match.index));
    const token=match[0];
    if(token.includes('/')){
      if(/^[+-]?\d+\/\d+$/.test(token)){
        const numeric=token.replace(/([+-]?)(\d+)\/(\d+)/,(_,sign,numerator,denominator)=>`${sign}<span class="frac"><sup>${numerator}</sup><i></i><sub>${denominator}</sub></span>`).replace(/-/g,' − ').replace(/\+/g,' + ');
        output+=numeric;offset=match.index+token.length;continue;
      }
      try{output+=`<span class="math-rendered" role="math" aria-label="${escapeHtml(token).replace(/\^/g,'&#94;')}">${renderFractionExpression(token)}</span>`}
      catch{const linear=escapeHtml(token).replace(/([A-Za-z0-9]+|[)\]}])\^(\d+|[A-Za-z]+|\([A-Za-z0-9+\-*/]+\))/g,'$1<span class="power">$2</span>');output+=`<span class="math-linear">${linear}</span><small class="math-fallback-label">（线性显示）</small>`}
    }else output+=escapeHtml(token).replace(/([A-Za-z0-9]+|[)\]}])\^(\d+|[A-Za-z]+|\([A-Za-z0-9+\-*/]+\))/g,'$1<span class="power">$2</span>').replace(/\*/g,' × ').replace(/\+/g,' + ').replace(/-/g,' − ');
    offset=match.index+token.length;
  }
  return (output+escapeHtml(source.slice(offset))).replace(/\s+/g,' ').trim();
}
export const questionText=q=>q?.displayQuestion||q?.question||(typeof q?.mathVerification?.expression==='string'?'计算 '+q.mathVerification.expression:'题目内容暂不可用，请联系家长');
export const displayClass=s=>s.length>92?'math-long':s.length>48?'math-medium':'math-short';
