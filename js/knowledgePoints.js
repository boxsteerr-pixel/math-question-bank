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
  '整式化简求值'
]);

export const FACTORIZATION_POINTS=Object.freeze(KNOWLEDGE_POINTS.filter(point=>point.startsWith('因式分解·')));

// Existing devices may have saved the pre-factorization six-item selection.
// Add only newly introduced points; never remove a parent-selected point.
export const includeNewKnowledgePoints=selected=>[...new Set([...(selected||[]),...FACTORIZATION_POINTS])];
