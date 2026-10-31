"""Read-only audit of the eight user-supplied Work questions."""
import json,re
from pathlib import Path
from fractions import Fraction as F
from difflib import SequenceMatcher
ROOT=Path(__file__).resolve().parents[1]
ns={'__file__':str(ROOT/'tools/audit-midterm-bank.py')}
exec((ROOT/'tools/audit-midterm-bank.py').read_text(encoding='utf8').split('rows=json.loads')[0],ns)
poly,structural,syntax=ns['poly'],ns['structural'],ns['syntax']
bank=json.loads((ROOT/'data/questions.json').read_text(encoding='utf8'))
items=[
 ('1','1-4a^2','(1-2a)(1+2a)','因式分解·平方差公式','平方差',2,'(1-2a)(1+2a)=1-4a²'),
 ('2','(6ab^2-4a^2b)/(2a)','3b^2-2ab','整式乘除综合','多项式除以单项式',2,'a≠0；逐项除以2a得到3b²-2ab'),
 ('3','4xy^2*2xy^4+(-2xy^3)^2','12x^2y^6','单项式乘法','积的乘方与合并同类项',2,'8x²y⁶+4x²y⁶=12x²y⁶'),
 ('4','(a+6)(a-2)-a(a+3)','a-12','多项式乘多项式','乘法与整式化简',2,'a²+4a-12-a²-3a=a-12'),
 ('5','2x^2y(x-y)+6xy^2(y-x)','2xy(x-y)(x-3y)','因式分解·综合方法','相反式与提公因式',3,'y-x=-(x-y)，提2xy(x-y)得2xy(x-y)(x-3y)'),
 ('6','(7/9)^2025*(-9/7)^2024','7/9','幂的运算综合','积的乘方和奇偶符号',2,'(7/9)×[(7/9)(-9/7)]^2024=7/9'),
 ('7','(-18x^4y^5+12x^5y^7-27x^3y^3)/(-3xy)^3','2/3xy^2-4/9x^2y^4+1','整式乘除综合','整式除以单项式',3,'xy≠0；分母=-27x³y³，逐项相除得2/3xy²-4/9x²y⁴+1'),
 ('8','a^2-b^2=28,a+b=7','4','乘法公式','平方差逆用',2,'(a-b)(a+b)=28且a+b=7，所以a-b=4')]
assert len(bank)>=360 and bank[359]['id']=='Q0360' and len(items)==8
bank=bank[:360]
for n,expr,answer,point,skill,difficulty,steps in items:
 if n in ('1','2','3','4','5','7'): assert poly(expr)==poly(answer),(n,'math')
 if n=='6': assert F(7,9)*(-1)**2024==F(7,9)
 if n=='8': assert F(28,7)==4
 # Compare full normalized text for every record; symbolic comparison is
 # restricted to expressions parsed without dropping contextual conditions.
 def norm(s):return re.sub(r'[\s*·×，,。；;：:]', '',s).replace('−','-')
 exact=[];equivalent=[]
 for q in bank:
  text=q['question']; stripped=re.split('[:：]',text)[-1].rstrip('。． ')
  if norm(stripped)==norm(expr):exact.append(q['id'])
  if n in ('1','3','4','5') and q.get('answerType')=='expression' and not any(w in text for w in ['已知','其中','求值','当']):
   try:
    if poly(stripped)==poly(expr):equivalent.append(q['id'])
   except (ValueError,SyntaxError,AssertionError,ZeroDivisionError,TypeError):pass
 near=sorted(((SequenceMatcher(None,norm(expr),norm(q['question'])).ratio(),q['id']) for q in bank),reverse=True)[:3]
 print(json.dumps({'candidate':n,'expr':expr,'answer':answer,'knowledge':point,'skill':skill,'difficulty':difficulty,'derivation':steps,'math':'PASS','exact':exact,'equivalentPolynomialCandidates':equivalent,'nearest':near},ensure_ascii=False))
