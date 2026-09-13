const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const superscriptDigits={'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
const normalizeSuperscripts=value=>String(value??'').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g,run=>`^${[...run].map(char=>superscriptDigits[char]).join('')}`);
export function normalizeMathInput(value){let s=String(value??'').replace(/[−－]/g,'-').replace(/[＋]/g,'+').replace(/×/g,'*').replace(/[÷／⁄]/g,'/');s=s.replace(/[０-９]/g,char=>String.fromCharCode(char.charCodeAt(0)-0xFEE0));s=normalizeSuperscripts(s);return s.replace(/[［【{]/g,'(').replace(/[］】}]/g,')');}
function normalizeDisplay(value){let s=String(value??'').replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/');s=normalizeSuperscripts(s);return s.replace(/[［【]/g,'[').replace(/[］】]/g,']');}
export function formatMath(value){let s=escapeHtml(normalizeDisplay(value));s=s.replace(/([+-]?)(\d+)\/(\d+)/g,(_,sign,numerator,denominator)=>`${sign}<span class="frac"><sup>${numerator}</sup><i></i><sub>${denominator}</sub></span>`);s=s.replace(/([A-Za-z0-9]+|[)\]}])\^(\d+)/g,'$1<span class="power">$2</span>');s=s.replace(/\*/g,' × ').replace(/\+/g,' + ').replace(/-/g,' − ').replace(/\s+/g,' ').trim();return s;}
export const displayClass=s=>s.length>92?'math-long':s.length>48?'math-medium':'math-short';
