import {parseFactorizedForm} from '../../js/factorizedForm.js';
function serialize(a,expandPowers=false){
  switch(a.op){
    case 'number':return a.value[1]===1n?String(a.value[0]):`(${a.value[0]}/${a.value[1]})`;
    case 'variable':return a.name;
    case 'negative':return `-(${serialize(a.base,expandPowers)})`;
    case 'power':return expandPowers?(a.exponent?Array.from({length:a.exponent},()=>`(${serialize(a.base,true)})`).join('*'):'1'):`(${serialize(a.base)})^${a.exponent}`;
    default:return `(${serialize(a.left,expandPowers)}${a.op}${serialize(a.right,expandPowers)})`;
  }
}
function terms(a){if(a.op==='*')return [...terms(a.left),...terms(a.right)];if(a.op==='negative')return ['-1',...terms(a.base)];return [serialize(a)]}
export function factorizationVariants(answer){
  const ast=parseFactorizedForm(answer),factors=terms(ast),variants=[{kind:'factor_order_and_constant_position',input:factors.slice().reverse().map(s=>`(${s})`).join('*')},{kind:'negative_movement',input:`-(-(${answer}))`},{kind:'power_to_repeated_factors',input:serialize(ast,true)}];
  if(factors.length>=2)variants.push({kind:'two_factor_sign_movement',input:[`-(${factors[0]})`,`-(${factors[1]})`,...factors.slice(2)].map(s=>`(${s})`).join('*')});
  return variants;
}
