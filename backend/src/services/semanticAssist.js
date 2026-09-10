const embedder = require('../services/embedder');
const semanticStore = require('../services/semanticStore');
const kbCache = require('../services/kbCache');
const policy = require('../utils/tokenPolicy');

const ASSIST_MARGIN = Number(process.env.SEMANTIC_ASSIST_MARGIN) || 0.15;
const ASSIST_TOP_K = Number(process.env.SEMANTIC_TOP_K) || 3;
const ASSIST_TIMEOUT_MS = Number(process.env.SEMANTIC_TIMEOUT_MS) || 10000;

const enabled = () => process.env.SEMANTIC_ENABLED !== '0';

const composeText = (item) => `${item.title || ''} ${item.description || ''}`.trim();

const evaluateAssistRule = async ({ itemText, lexicalStatus, matches, margin, marginFloor, getRowText }) => {
  const none = (reasons, extra) => ({ suggestion: null, blocked: { reasons, ...(extra || {}) } });
  if (lexicalStatus !== 'CODER_REVIEW') return { suggestion: null, blocked: null };
  const top = matches && matches[0];
  if (!top) return none(['NO_SEMANTIC_CANDIDATE']);
  const floor = marginFloor == null ? ASSIST_MARGIN : marginFloor;
  if (!(margin >= floor)) {
    return none(['MARGIN_BELOW_FLOOR'], { kbCode: top.kbCode, score: top.score, margin });
  }
  const rowText = getRowText ? await getRowText(top) : '';
  const gate = policy.checkCodeAgreement(
    policy.extractCodeTokens(itemText || ''),
    policy.extractCodeTokens(rowText || '')
  );
  if (!gate.pass) {
    return none(gate.reasons, { kbCode: top.kbCode, score: top.score, margin });
  }
  return {
    suggestion: {
      classification_method: 'SEMANTIC_ASSIST',
      status: 'CODER_REVIEW',
      fw_related: null,
      complexity_level_id: null,
      confidence_score: null,
      classification_reason:
        `Semantic assist suggests knowledge base item ${top.kbCode} ` +
        `(similarity ${(top.score * 100).toFixed(0)}%, margin ${margin.toFixed(2)}). Requires coder review.`,
      kb_item_id: top.kbId != null ? top.kbId : null,
      kb_code: top.kbCode,
      rule_id: null,
      match_score: top.score,
      semantic_margin: margin,
    },
    blocked: null,
  };
};

const assistWithSemantic = async (item, lexicalResult, opts = {}) => {
  if (!enabled()) return null;
  if (!lexicalResult || lexicalResult.status !== 'CODER_REVIEW') return null;
  const marginFloor = opts.marginFloor == null ? ASSIST_MARGIN : opts.marginFloor;
  const topK = opts.topK == null ? ASSIST_TOP_K : opts.topK;
  const timeoutMs = opts.timeoutMs == null ? ASSIST_TIMEOUT_MS : opts.timeoutMs;
  try {
    const matrix = await semanticStore.getMatrix();
    let matches;
    let margin;
    if (opts.precomputed && Array.isArray(opts.precomputed.matches)) {
      matches = opts.precomputed.matches;
      margin = opts.precomputed.margin;
    } else {
      const vecs = await embedder.embed([composeText(item)], { timeoutMs });
      if (!vecs || !vecs[0]) return null;
      const retrieved = semanticStore.retrieve(vecs[0], matrix, topK);
      matches = retrieved.matches;
      margin = retrieved.margin;
    }
    const topRow = (matches && matches[0]) || null;
    const getRowText = async (top) => {
      const prepared = await kbCache.getPreparedKb();
      const row = top ? prepared.rows.find((r) => (top.kbId != null ? r.id === top.kbId : r.kb_code === top.kbCode)) : null;
      return row ? `${row.title || ''} ${row.description || ''}` : '';
    };
    const { suggestion } = await evaluateAssistRule({
      itemText: composeText(item),
      lexicalStatus: lexicalResult.status,
      matches, margin, marginFloor, getRowText,
    });
    return suggestion;
  } catch {
    return null;
  }
};

module.exports = { assistWithSemantic, evaluateAssistRule, enabled, ASSIST_MARGIN, ASSIST_TOP_K, ASSIST_TIMEOUT_MS };
