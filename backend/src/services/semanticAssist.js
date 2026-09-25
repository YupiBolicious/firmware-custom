const embedder = require('../services/embedder');
const semanticStore = require('../services/semanticStore');
const kbCache = require('../services/kbCache');
const policy = require('../utils/tokenPolicy');

const ASSIST_MIN_SCORE = Number(process.env.SEMANTIC_ASSIST_MIN_SCORE) || 0.60;
const ASSIST_TOP_K = Number(process.env.SEMANTIC_TOP_K) || 3;
const ASSIST_TIMEOUT_MS = Number(process.env.SEMANTIC_TIMEOUT_MS) || 10000;

const enabled = () => process.env.SEMANTIC_ENABLED !== '0';

const composeText = (item) => `${item.title || ''} ${item.description || ''}`.trim();

const evaluateAssistRule = async ({ itemText, lexicalStatus, matches, margin, scoreFloor, resolveRow }) => {
  const none = (reasons, extra) => ({ suggestion: null, blocked: { reasons, ...(extra || {}) } });
  if (lexicalStatus !== 'CODER_REVIEW') return { suggestion: null, blocked: null };
  const top = matches && matches[0];
  if (!top) return none(['NO_SEMANTIC_CANDIDATE']);
  // Gate is an ABSOLUTE top-candidate score floor, not top-vs-second margin:
  // a low margin blocks auto-claim (decider's SEMANTIC_MARGIN) but must not
  // bury a sufficiently relevant candidate from the coder. Margin is carried
  // through to the suggestion/telemetry as information only.
  const floor = scoreFloor == null ? ASSIST_MIN_SCORE : scoreFloor;
  if (!(top.score >= floor)) {
    return none(['SCORE_BELOW_FLOOR'], { kbCode: top.kbCode, score: top.score, margin });
  }
  const row = resolveRow ? await resolveRow(top) : null;
  if (!row) {
    return none(['ROW_UNRESOLVED'], { kbCode: top.kbCode, score: top.score, margin });
  }
  const rowText = `${row.title || ''} ${row.description || ''}`.trim();
  const gate = policy.checkCodeAgreement(
    policy.extractCodeTokens(itemText || ''),
    policy.extractCodeTokens(rowText)
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

// Block reasons reported by the assist rule's code-agreement gate (tokenPolicy).
const CODE_GATE_REASONS = ['MODEL_CODE_MISMATCH', 'VERSION_MISMATCH', 'SERIAL_MISMATCH', 'MEASUREMENT_MISMATCH'];

// Priority for choosing WHICH block reason is the primary one. Code/model
// mismatch outranks a low score on purpose: if a candidate's codes disagree
// with the item, regardless of how low its score is, the mismatch is the
// more important fact for the human reviewer. Low score only wins when no
// mismatch exists.
const blockReasonPriority = [
  (r) => CODE_GATE_REASONS.includes(r),
  (r) => r === 'SCORE_BELOW_FLOOR',
  (r) => r === 'NO_SEMANTIC_CANDIDATE' || r === 'ROW_UNRESOLVED',
];

const pickPrimaryBlockedReason = (reasons) => {
  if (!Array.isArray(reasons)) return null;
  for (const pred of blockReasonPriority) {
    const hit = reasons.find(pred);
    if (hit) return hit;
  }
  return null;
};

// Structured why-review code, persisted on the classification row.
// Priority per policy: CODE_MODEL_MISMATCH -> SEMANTIC_CANDIDATE_LOW_QUALITY
// (SCORE_BELOW_FLOOR) -> NO_USABLE_SEMANTIC_CANDIDATE
// (NO_SEMANTIC_CANDIDATE/ROW_UNRESOLVED) -> NO_EXACT_OR_RULE_MATCH fallback.
// An assist suggestion means a candidate passed the floor, so the reason the
// item still needs a human is simply that no exact/rule match decided it.
const deriveReviewReason = ({ assist, assistBlockedReasons }) => {
  if (assist) return 'NO_EXACT_OR_RULE_MATCH';
  const primary = pickPrimaryBlockedReason(assistBlockedReasons);
  if (primary != null && CODE_GATE_REASONS.includes(primary)) return 'CODE_MODEL_MISMATCH';
  if (primary === 'SCORE_BELOW_FLOOR') return 'SEMANTIC_CANDIDATE_LOW_QUALITY';
  if (primary === 'NO_SEMANTIC_CANDIDATE' || primary === 'ROW_UNRESOLVED') return 'NO_USABLE_SEMANTIC_CANDIDATE';
  return 'NO_EXACT_OR_RULE_MATCH';
};

const fromPrepared = (prepared, top) =>
  top ? prepared.rows.find((r) => (top.kbId != null ? r.id === top.kbId : r.kb_code === top.kbCode)) || null : null;

const assistWithSemantic = async (item, lexicalResult, opts = {}) => {
  if (!enabled()) return null;
  if (!lexicalResult || lexicalResult.status !== 'CODER_REVIEW') return null;
  const scoreFloor = opts.scoreFloor == null ? ASSIST_MIN_SCORE : opts.scoreFloor;
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
    const prepared = await kbCache.getPreparedKb();
    const resolveRow = (top) => fromPrepared(prepared, top);
    const { suggestion } = await evaluateAssistRule({
      itemText: composeText(item),
      lexicalStatus: lexicalResult.status,
      matches, margin, scoreFloor, resolveRow,
    });
    return suggestion;
  } catch {
    return null;
  }
};

module.exports = {
  assistWithSemantic, evaluateAssistRule, deriveReviewReason, pickPrimaryBlockedReason,
  enabled, ASSIST_MIN_SCORE, ASSIST_TOP_K, ASSIST_TIMEOUT_MS,
};
