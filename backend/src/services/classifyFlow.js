const classificationService = require('../services/classificationService');
const shadowClassify = require('../services/shadowClassify');
const decider = require('../services/decider');
const kbCache = require('../services/kbCache');

const PATH_LEXICAL = 'lexical';
const PATH_SEMANTIC = 'semantic';
const PATH_REVIEW = 'review';

const composeText = (item) => `${item.title || ''} ${item.description || ''}`.trim();

const trySemanticDecision = async (item, semantic) => {
  const none = (reason, detail) => ({
    verdict: null,
    blocked: detail === undefined ? { reason } : { reason, detail },
  });
  try {
    const top = semantic && semantic.topMatches && semantic.topMatches[0];
    if (!top) return none(semantic ? 'NO_CANDIDATE' : 'NO_SEMANTIC');
    const prepared = await kbCache.getPreparedKb();
    const row = prepared.rows.find((r) => r.kb_code === top.kbCode) || null;
    if (!row) return none('ROW_UNRESOLVED');
    return decider.decideSemantic({
      itemText: composeText(item),
      matches: semantic.topMatches,
      margin: semantic.margin,
      rowText: `${row.title || ''} ${row.description || ''}`,
      row,
    });
  } catch {
    return none('ERROR');
  }
};

const classifyFlow = async (item, refs) => {
  const lexical = await classificationService.classifyItem(item, refs);
  if (lexical.status !== 'CODER_REVIEW') {
    return { path: PATH_LEXICAL, result: lexical, semantic: null, assist: null, lexical, decisionBlocked: null };
  }
  const wrapped = await shadowClassify.classifyWithShadow(item, refs, lexical);
  const { verdict, blocked } = await trySemanticDecision(item, wrapped.semantic);
  if (verdict) {
    return { path: PATH_SEMANTIC, result: verdict, semantic: wrapped.semantic, assist: wrapped.assist, lexical, decisionBlocked: null };
  }
  return { path: PATH_REVIEW, result: lexical, semantic: wrapped.semantic, assist: wrapped.assist, lexical, decisionBlocked: blocked };
};

module.exports = { classifyFlow, PATH_LEXICAL, PATH_SEMANTIC, PATH_REVIEW };
