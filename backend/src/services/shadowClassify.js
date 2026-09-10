const classificationService = require('../services/classificationService');
const embedder = require('../services/embedder');
const semanticStore = require('../services/semanticStore');
const kbCache = require('../services/kbCache');
const { evaluateAssistRule } = require('../services/semanticAssist');

const SHADOW_TIMEOUT_MS = Number(process.env.SEMANTIC_TIMEOUT_MS) || 10000;
const SHADOW_TOP_K = Number(process.env.SEMANTIC_TOP_K) || 3;
const ASSIST_MARGIN = Number(process.env.SEMANTIC_MARGIN) || 0.15;

const enabled = () => process.env.SEMANTIC_ENABLED !== '0';

const composeText = (item) => `${item.title || ''} ${item.description || ''}`.trim();

const shadowSemantic = async (item) => {
  const t0 = Date.now();
  try {
    const matrix = await semanticStore.getMatrix();
    const vecs = await embedder.embed([composeText(item)], { timeoutMs: SHADOW_TIMEOUT_MS });
    if (!vecs || !vecs[0]) return { topMatches: [], margin: 0, embedMs: Date.now() - t0, compareMs: 0 };
    const t1 = Date.now();
    const { matches, margin } = semanticStore.retrieve(vecs[0], matrix, SHADOW_TOP_K);
    return {
      topMatches: matches.map((m) => ({ kbCode: m.kbCode, score: m.score })),
      margin,
      embedMs: t1 - t0,
      compareMs: Date.now() - t1,
    };
  } catch {
    return null;
  }
};

const classifyWithShadow = async (item, refs, precomputedLexical) => {
  const lexical = precomputedLexical || await classificationService.classifyItem(item, refs);
  if (!enabled()) {
    return { lexical, semantic: null, assist: null, final: lexical };
  }
  const t0 = Date.now();
  const semantic = await shadowSemantic(item);
  const final = { ...lexical };
  const { suggestion, blocked } = await evaluateAssist(item, lexical, semantic);
  return {
    lexical,
    semantic: semantic ? { ...semantic, totalMs: Date.now() - t0, assistBlocked: blocked } : null,
    assist: suggestion,
    final,
  };
};

const evaluateAssist = async (item, lexical, semantic) => {
  const getRowText = async (top) => {
    const prepared = await kbCache.getPreparedKb();
    const row = top ? prepared.rows.find((r) => r.kb_code === top.kbCode) : null;
    return row ? `${row.title || ''} ${row.description || ''}` : '';
  };
  return evaluateAssistRule({
    itemText: composeText(item),
    lexicalStatus: lexical ? lexical.status : null,
    matches: semantic ? semantic.topMatches : null,
    margin: semantic ? semantic.margin : 0,
    getRowText,
  });
};

module.exports = { classifyWithShadow, enabled, evaluateAssist, SHADOW_TIMEOUT_MS, SHADOW_TOP_K, ASSIST_MARGIN };
