const classificationService = require('../services/classificationService');
const shadowClassify = require('../services/shadowClassify');
const decider = require('../services/decider');
const kbCache = require('../services/kbCache');

const PATH_LEXICAL = 'lexical';
const PATH_SEMANTIC = 'semantic';
const PATH_REVIEW = 'review';

const composeText = (item) => `${item.title || ''} ${item.description || ''}`.trim();

const trySemanticDecision = async (item, semantic) => {
  try {
    const top = semantic && semantic.topMatches && semantic.topMatches[0];
    if (!top) return null;
    const prepared = await kbCache.getPreparedKb();
    const row = prepared.rows.find((r) => r.kb_code === top.kbCode) || null;
    if (!row) return null;
    return decider.decideSemantic({
      itemText: composeText(item),
      matches: semantic.topMatches,
      margin: semantic.margin,
      rowText: `${row.title || ''} ${row.description || ''}`,
      row,
    });
  } catch {
    return null;
  }
};

const classifyFlow = async (item, refs) => {
  const lexical = await classificationService.classifyItem(item, refs);
  if (lexical.status !== 'CODER_REVIEW') {
    return { path: PATH_LEXICAL, result: lexical, semantic: null, assist: null };
  }
  const wrapped = await shadowClassify.classifyWithShadow(item, refs, lexical);
  const decision = await trySemanticDecision(item, wrapped.semantic);
  if (decision) {
    return { path: PATH_SEMANTIC, result: decision, semantic: wrapped.semantic, assist: wrapped.assist };
  }
  return { path: PATH_REVIEW, result: lexical, semantic: wrapped.semantic, assist: wrapped.assist };
};

module.exports = { classifyFlow, PATH_LEXICAL, PATH_SEMANTIC, PATH_REVIEW };
