export const KNOWLEDGE_POINTS=Object.freeze([
  '相反数',
  '绝对值',
  '去括号',
  '添括号',
  '合并同类项',
  '整式加减综合',
  '因式分解·提公因式法',
  '因式分解·平方差公式',
  '因式分解·完全平方公式',
  '因式分解·综合方法',
  '同底数幂乘法',
  '同底数幂除法',
  '幂的乘方',
  '积的乘方',
  '幂的运算综合',
  '单项式乘法',
  '多项式乘多项式',
  '乘法公式',
  '整式乘法综合',
  '整式乘除综合',
  '整式化简求值'
]);

export const FACTORIZATION_POINTS=Object.freeze(KNOWLEDGE_POINTS.filter(point=>point.startsWith('因式分解·')));

export const FRACTION_KNOWLEDGE_POINTS=Object.freeze([
  {id:'F13_CONCEPT',name:'分式概念与意义',chapter:13},
  {id:'F13_CONDITIONS',name:'分式有意义、无意义及值为零的条件',chapter:13},
  {id:'F13_PROPERTIES',name:'分式基本性质与通分',chapter:13},
  {id:'F13_SIMPLIFY',name:'分式约分与最简分式',chapter:13},
  {id:'F13_MULTIPLY_DIVIDE',name:'分式乘除与乘方',chapter:13},
  {id:'F13_ADD_SUBTRACT',name:'分式加减',chapter:13},
  {id:'F13_MIXED',name:'分式混合运算与化简求值',chapter:13},
  {id:'F13_EQUATION',name:'分式方程、增根与应用',chapter:13},
]);
export const ALL_KNOWLEDGE_POINTS=Object.freeze([...KNOWLEDGE_POINTS,...FRACTION_KNOWLEDGE_POINTS.map(point=>point.id)]);
export const knowledgePointName=id=>FRACTION_KNOWLEDGE_POINTS.find(point=>point.id===id)?.name||id;

// Historical selections are authoritative. An absent setting is initialized
// from KNOWLEDGE_POINTS by the caller; explicit selections are never expanded.
export const includeNewKnowledgePoints=selected=>[...new Set(selected||[])];
