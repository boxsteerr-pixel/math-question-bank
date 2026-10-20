# Independent audit: Python standard library exact Fraction + AST, not the production JS scorer.
# Read-only: rechecks all68 candidates against frozen old287 and existing pending.
import ast,hashlib,itertools,json,re,sys,unicodedata
from collections import Counter
from fractions import Fraction as F
from pathlib import Path
REPO=Path(__file__).resolve().parents[1]; R=REPO/'reports/midterm_20261019'
def normalize(s):
    import unicodedata
    return unicodedata.normalize('NFKC',s).translate(str.maketrans({'−':'-','—':'-','–':'-','×':'*','·':'*','÷':'/','[':'(',']':')','{':'(','}':')'}))

def syntax(s):
    s=normalize(s).replace('^','**')
    t=re.findall(r'\d+(?:\.\d+)?|[A-Za-z]|\*\*|[+*/()\-]',s)
    if ''.join(t)!=re.sub(r'\s','',s):raise ValueError('unrecognized expression')
    out=[]
    for i,x in enumerate(t):
        if i and (re.fullmatch(r'\d+(?:\.\d+)?|[A-Za-z]|\)',t[i-1])) and (re.fullmatch(r'\d+(?:\.\d+)?|[A-Za-z]|\(',x)):
            out.append('*')
        out.append(x)
    return ast.parse(''.join(out),mode='eval').body

def add(a,b):
    out=dict(a)
    for k,v in b.items():out[k]=out.get(k,F(0))+v
    return {k:v for k,v in out.items() if v}
def scale(a,n):return {k:v*n for k,v in a.items() if v*n}
def mul(a,b):
    out={}
    for ka,va in a.items():
        for kb,vb in b.items():
            powers=dict(ka)
            for k,v in kb:powers[k]=powers.get(k,0)+v
            key=tuple(sorted((k,v) for k,v in powers.items() if v))
            out[key]=out.get(key,F(0))+va*vb
    return {k:v for k,v in out.items() if v}
def power(a,n):
    if n<0:
        if len(a)!=1:raise ValueError('nonmonomial negative power')
        (key,val),=a.items();return {tuple((k,v*n) for k,v in key):val**n}
    result={():F(1)}
    while n:
        if n&1:result=mul(result,a)
        n//=2
        if n:a=mul(a,a)
    return result
def evaluate(n,subs={}):
    if isinstance(n,ast.Constant):return {():F(str(n.value))} if n.value else {}
    if isinstance(n,ast.Name):return subs.get(n.id,{((n.id,1),):F(1)})
    if isinstance(n,ast.UnaryOp):return scale(evaluate(n.operand,subs),-1 if isinstance(n.op,ast.USub) else 1)
    if isinstance(n,ast.BinOp):
        a=evaluate(n.left,subs);b=evaluate(n.right,subs)
        if isinstance(n.op,ast.Add):return add(a,b)
        if isinstance(n.op,ast.Sub):return add(a,scale(b,-1))
        if isinstance(n.op,ast.Mult):return mul(a,b)
        if isinstance(n.op,ast.Div):return mul(a,power(b,-1))
        if isinstance(n.op,ast.Pow):
            assert len(b)<=1 and (not b or () in b),'variable exponent'
            exponent=b.get((),F(0));assert exponent.denominator==1
            return power(a,int(exponent))
    raise ValueError('unsupported AST')
def poly(s,subs={}):return evaluate(syntax(s),subs)
def signature(p):return str(sorted((k,str(v)) for k,v in p.items()))
def structural(n):
    if isinstance(n,ast.BinOp) and isinstance(n.op,(ast.Add,ast.Sub)):
        def terms(x,sign=1):
            if isinstance(x,ast.BinOp) and isinstance(x.op,ast.Add):return terms(x.left,sign)+terms(x.right,sign)
            if isinstance(x,ast.BinOp) and isinstance(x.op,ast.Sub):return terms(x.left,sign)+terms(x.right,-sign)
            return [(sign,structural(x))]
        return ('sum',tuple(sorted(terms(n),key=str)))
    if isinstance(n,ast.BinOp) and isinstance(n.op,ast.Mult):
        def terms(x):return terms(x.left)+terms(x.right) if isinstance(x,ast.BinOp) and isinstance(x.op,ast.Mult) else [structural(x)]
        return ('product',tuple(sorted(terms(n),key=str)))
    if isinstance(n,ast.BinOp) and isinstance(n.op,ast.Pow):return ('power',structural(n.left),structural(n.right))
    if isinstance(n,ast.BinOp) and isinstance(n.op,ast.Div):return ('quotient',structural(n.left),structural(n.right))
    if isinstance(n,ast.UnaryOp):return ('sign',-1 if isinstance(n.op,ast.USub) else 1,structural(n.operand))
    if isinstance(n,ast.Name):return ('variable',n.id)
    if isinstance(n,ast.Constant):return ('number',str(F(str(n.value))))
    raise ValueError('unsupported structural AST')


rows=json.loads((R/'candidates.json').read_text(encoding='utf8'));bank=json.loads((REPO/'data/questions.json').read_text(encoding='utf8'))[:287];pending=json.loads((REPO/'data/questions_pending.json').read_text(encoding='utf8'))
assert len(bank)==287
def expr(q):
    s=q.get('expression') or q['question'];s=re.sub(r'^(计算|化简|因式分解|分解因式|合并同类项)[:：]?','',s)
    return re.sub(r'[。；;．]+$','',s)
def alpha(s,mode='text'):
    s=normalize(s);s=re.sub(r'[\s，,。；;：:．]','',s)
    if mode=='text':s=re.sub(r'^(计算|化简|因式分解|分解因式|合并同类项)','',s)
    names=sorted(set(re.findall('[a-z]',s)))
    if len(names)>5:return s
    results=[]
    for perm in itertools.permutations('uvwrt'[:len(names)]):
        t=s.translate(str.maketrans(dict(zip(names,perm))))
        try: v=signature(poly(t)) if mode=='factor' else str(structural(syntax(t))) if mode=='structure' else t
        except (ValueError,SyntaxError,AssertionError,ZeroDivisionError,TypeError):continue
        results.append(v)
    return min(results) if results else s
def keys(q):
    contextual=any(w in q['question'] for w in ['已知','若','当','其中','求值','先化简','有一个因式'])
    factor=q['question'].startswith(('因式分解','分解因式','利用立方差','利用配方法'))
    e=expr(q)
    if factor:e=re.sub(r'^利用[^：]+：','',e)
    return {'text':alpha(q['question']),**({} if contextual else {'structure':alpha(e,'structure')}),**({'factor':alpha(e,'factor')} if factor else {})}
def certify_factors(node):
    if isinstance(node,ast.UnaryOp):return certify_factors(node.operand)
    if isinstance(node,ast.BinOp) and isinstance(node.op,ast.Mult):
        certify_factors(node.left);certify_factors(node.right);return
    if isinstance(node,ast.BinOp) and isinstance(node.op,ast.Pow):
        exponent=evaluate(node.right).get((),F(0));assert exponent.denominator==1 and exponent>0
        return certify_factors(node.left)
    p=evaluate(node);assert p,'zero is not a factor'
    degree=max(sum(n for _,n in monomial) for monomial in p)
    if degree<=1:return
    assert degree==2,'uncertified higher-degree factor'
    names=sorted({v for k in p for v,n in k})
    if len(names)==1:
        x=names[0];a=p.get(((x,2),),F(0));b=p.get(((x,1),),F(0));c=p.get((),F(0))
    else:
        assert len(names)==2 and all(sum(n for _,n in monomial)==2 for monomial in p)
        x,y=names;a=p.get(((x,2),),F(0));b=p.get(tuple(sorted(((x,1),(y,1)))),F(0));c=p.get(((y,2),),F(0))
    assert a and c and b*b-4*a*c<0,'quadratic is not certified irreducible over Q'
indexed=[(q,keys(q)) for q in bank+pending]
accepted=[]
for i,r in enumerate(rows):
    ans=r['answer'];expected=None
    if 'expression' in r:
        expected=poly(r['expression']); subs={k:poly(v) for k,v in r.get('substitution',{}).items()}
        if isinstance(ans,list):expected=[expected,poly(r['expression'],subs)]
        elif subs:expected=poly(r['expression'],subs)
    elif r.get('proof')=='identity':
        expected=poly(r['derived']);identity=r['identity']
        if '=' in identity and not re.search(r'\^\([^)]*[a-z]|\^[a-z]',identity) and '；' not in identity and '，' not in identity:
            a,b=identity.split('=');assert poly(a)==poly(b),(r['sourceKey'],r['sourceIndex'],'identity')
    elif r.get('proof')=='root':
        p=r['parameter'];a=poly(r['polynomial'],{'x':poly(r['root']),p:{}}); b=poly(r['polynomial'],{'x':poly(r['root']),p:poly('1')}); coefficient=add(b,scale(a,-1));assert coefficient
        v=-a.get((),F(0))/coefficient.get((),F(0));expected=poly(str(v))
        assert poly(r['polynomial'],{'x':poly(r['root']),p:expected})=={}
    elif r.get('proof')=='factorRoot':
        p=r['parameter']; pv=poly(r['parameterValue']);assert poly(r['polynomial'],{'x':poly(r['root']),p:pv})=={}
        assert poly(r['polynomial'],{p:pv})==poly('('+r['factor']+')*('+ans+')');expected=poly(ans)
    elif r.get('proof')=='coefficient':
        p=poly(r['expression2']);expected={():sum((p.get((('x',n),),F(0)) if n else p.get((),F(0))) for n in r['indices'])}
    elif r.get('proof')=='zeroCoefficient':
        p=poly(r['expression2'],{r['parameter']:poly(r['parameterValue'])});assert p.get((('x',1),),F(0))==0
        raw=poly(r['expression2']);assert any((('x',1) in k and (r['parameter'],1) in k) for k in raw);expected=poly(r['parameterValue'])
    elif r.get('proof')=='remainder':
        assert poly(r['polynomial'])==poly('('+r['divisor']+')*('+r['quotient']+')+'+r['derived']);expected=poly(r['derived'])
    actual=[poly(a) for a in ans] if isinstance(ans,list) else poly(ans)
    assert expected==actual,(r['sourceKey'],r['sourceIndex'],'independent mismatch',expected,actual)
    r['independentResult']=ans;r['independentVerification']='PASS'
    r['candidateId']=f'CAND-MIDTERM-20261019-{i+1:03}'
    r['answerType']='multiple_blank' if isinstance(ans,list) else 'expression' if re.search('[a-z]',ans) else 'number'
    if r['question'].startswith(('因式分解','分解因式','利用立方差','利用配方法')):
        certify_factors(syntax(ans))
        r['answerConstraint']='fully_factored';r['fullyFactored']=True
        # All references consist of linear primitive factors, their powers, and
        # the two explicitly certified irreducible quadratic factors below.
        r['factorCertificate']='linear factors over Q, or negative-discriminant quadratic (a^2+ab+b^2 / x^2+3x+9); exact expansion verified'
    k=keys(r);matches=[]
    for q,qk in indexed+[(q,keys(q)) for q in accepted]:
        same=[name for name in k if name in qk and k[name]==qk[name]]
        if same:matches.append({'id':q.get('id') or q.get('candidateId'),'method':same})
    r['duplicates']=matches;r['decision']='REJECT_DUPLICATE' if matches else 'ACCEPT'
    if not matches:accepted.append(r)

print(json.dumps({'candidates':len(rows),'independentPass':len(rows),'accepted':len(accepted),'duplicate':len(rows)-len(accepted)},ensure_ascii=False))
for r in rows:print(r['candidateId'],r['sourceKey'],r['sourceIndex'],r['decision'],r['duplicates'])
