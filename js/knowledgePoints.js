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
  '因式分解·综合方法'
]);

export const FACTORIZATION_POINTS=Object.freeze(KNOWLEDGE_POINTS.slice(-4));

// Existing devices may have saved the pre-factorization six-item selection.
// Add only newly introduced points; never remove a parent-selected point.
export const includeNewKnowledgePoints=selected=>[...new Set([...(selected||[]),...FACTORIZATION_POINTS])];
