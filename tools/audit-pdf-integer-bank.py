"""Read-only, exact Fraction/AST verification of the approved PDF integer additions."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ns={'__file__':str(ROOT/'tools/audit-midterm-bank.py')}
exec((ROOT/'tools/audit-midterm-bank.py').read_text(encoding='utf8').split('rows=json.loads')[0],ns)
poly=ns['poly']
rows=json.loads((ROOT/'tests/fixtures/pdf-integer-candidates-20261023.json').read_text(encoding='utf8'))
manifest=json.loads((ROOT/'data/pdf-integer-promotion-20261023.json').read_text(encoding='utf8'))
assert len(rows)==10 and all(r['decision']=='ACCEPT' for r in rows)
assert [e['candidateId'] for e in manifest['entries']]==[r['candidateId'] for r in rows]
for r,e in zip(rows,manifest['entries']):
    q=e['question'];a=r['answer'];expr=r['expression']
    assert q['question']==r['question'] and q['displayQuestion']==r['displayQuestion']
    assert q['answer']==a==r['teacherAnswer']==r['calculatedAnswer']
    assert all(q[k]==r[k] for k in ['source','questionPage','answerPage','sourceIndex','knowledgePoint','answerType'])
    if 'identity' in r:
        assert poly(expr)==poly(r['identity'])
        assert poly(r['derived'])==poly(a)
        if r['candidateId']=='CAND-I-023':
            assert r['conditions']=='a^2-2a+2=3'
            assert poly(expr)==poly('2*((a^2-2a+2)-2)+1')
            assert poly(a)==poly('2*(3-2)+1')
        elif r['candidateId']=='CAND-I-024':
            assert r['conditions']=='m^2+n^2=3，mn=-1'
            assert poly(expr)==poly('-6*(m^2+n^2)+5*mn+9')
            assert poly(a)==poly('-6*3+5*(-1)+9')
        else:raise AssertionError('Unreviewed identity')
    else:
        for step in r['steps']:assert poly(expr)==poly(step)
        assert poly(expr)==poly(a[0] if isinstance(a,list) else a)
        if isinstance(a,list):
            assert poly(expr,{k:poly(v) for k,v in r['substitution'].items()})==poly(a[1])
            if r['candidateId']=='CAND-I-018':
                assert r['conditions']=='|a-2|+|b+1|=0'
                assert r['substitution']=={'a':'2','b':'-1'}
print(json.dumps({'independentPass':len(rows),'sourceAnswersMatch':len(rows),'formalIds':[e['question']['id'] for e in manifest['entries']]}))
