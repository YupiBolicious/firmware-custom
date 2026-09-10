const { normalize } = require('../utils/tokenPolicy');

const contextNote = (bonus) => {
  if (bonus > 0) return `, context +${Math.round(bonus * 100)}%`;
  if (bonus < 0) return `, context ${Math.round(bonus * 100)}%`;
  return '';
};

// POLICY (frozen): tiers, labels, statuses, confidence, rules, fallback. No scoring math.
const isDeterministicIdentity = (text, kb) =>
  text === normalize(`${kb.title} ${kb.description || ''}`);

// Dice-corroboration floor: a Dice-driven candidate enters the strong tier only
// with supporting title-word evidence. Read at call time so ablation can sweep
// values without code hooks. Default 0 preserves current behavior until a
// calibrated value is approved.
const diceMinJaccard = () => {
  const v = Number(process.env.LEXICAL_DICE_MIN_JACCARD);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

const COVERAGE_MIN_TOKENS = 2;

// Single source for tier labels; returns null below all bands.
const labelForTier = ({ score, isIdentity, jTitle }) => {
  if (score >= 0.6) {
    if (isIdentity) return 'EXACT_MATCH';
    return (jTitle || 0) >= diceMinJaccard() ? 'LEXICAL_SIMILARITY' : 'SIMILARITY';
  }
  if (score >= 0.35) return 'SIMILARITY';
  return null;
};

const decideBest = ({ bestKb, bestKbScore, bestKbBonus, bestKbJTitle, coverageCount, coveredKb, sharedCount, rules, text }) => {
  // AUTO CLASSIFY FOR EXACT MATCH
  if (bestKb && bestKbScore >= 0.6) {
    // const confidence = Math.min(Number(bestKb.confidence_score), 99);
    //or limited by similarity
    const confidenceBySimilarity =  Math.min(bestKbScore * 100, Number(bestKb.confidence_score), 99);
    const label = labelForTier({
      score: bestKbScore,
      isIdentity: isDeterministicIdentity(text, bestKb),
      jTitle: bestKbJTitle,
    });
    if (label === 'EXACT_MATCH') {
      return {
        fw_related: bestKb.fw_related,
        complexity_level_id: bestKb.fw_related ? bestKb.complexity_level_id : null,
        classification_method: 'EXACT_MATCH',
        confidence_score: confidenceBySimilarity,
        classification_reason: `Exact match with knowledge base item ${bestKb.kb_code} (similarity ${(bestKbScore * 100).toFixed(0)}%${contextNote(bestKbBonus)})`,
        status: bestKb.fw_related ? 'CLASSIFIED' : 'NON_FIRMWARE',
        kb_item_id: bestKb.id,
        match_score: bestKbScore,
      };
    }
    if (label === 'LEXICAL_SIMILARITY') {
      return {
        fw_related: bestKb.fw_related,
        complexity_level_id: bestKb.fw_related ? bestKb.complexity_level_id : null,
        classification_method: 'LEXICAL_SIMILARITY',
        confidence_score: confidenceBySimilarity,
        classification_reason: `Strong lexical match with knowledge base item ${bestKb.kb_code} (similarity ${(bestKbScore * 100).toFixed(0)}%${contextNote(bestKbBonus)})`,
        status: bestKb.fw_related ? 'CLASSIFIED' : 'NON_FIRMWARE',
        kb_item_id: bestKb.id,
        match_score: bestKbScore,
      };
    }
    // Dice-only support below the corroboration floor: fall through to
    // the SIMILARITY tier (review with suggestion) instead of auto-claiming.
  }

  // 1b) SIMILARITY match — partial KB overlap, below exact threshold.
  //     Unique coverage auto-claims: every item token found in exactly one KB
  //     row (which must also be the best-scoring row), with at least
  //     COVERAGE_MIN_TOKENS shared. Otherwise suggest + require coder review.
  if (bestKb && bestKbScore >= 0.35) {
    if (coverageCount === 1 && coveredKb && coveredKb.id === bestKb.id
        && (sharedCount || 0) >= COVERAGE_MIN_TOKENS) {
      const confidenceByCoverage = Math.min(bestKbScore * 100, Number(coveredKb.confidence_score), 99);
      return {
        fw_related: coveredKb.fw_related,
        complexity_level_id: coveredKb.fw_related ? coveredKb.complexity_level_id : null,
        classification_method: 'LEXICAL_SIMILARITY',
        confidence_score: confidenceByCoverage,
        classification_reason: `Unique coverage: all item keywords found only in knowledge base item ${coveredKb.kb_code} (similarity ${(bestKbScore * 100).toFixed(0)}%${contextNote(bestKbBonus)})`,
        status: coveredKb.fw_related ? 'CLASSIFIED' : 'NON_FIRMWARE',
        kb_item_id: coveredKb.id,
        match_score: bestKbScore,
      };
    }
    return {
      fw_related: null,
      complexity_level_id: null,
      classification_method: 'SIMILARITY',
      confidence_score: null,
      classification_reason: `Similar to knowledge base item ${bestKb.kb_code} (similarity ${(bestKbScore * 100).toFixed(0)}%${contextNote(bestKbBonus)}). Requires coder review.`,
      status: 'CODER_REVIEW',
      kb_item_id: bestKb.id,
      match_score: bestKbScore,
    };
  }

  // 2) RULE MATCH against classification_rules (priority ordered)
  for (const rule of rules) {
    const pattern = normalize(rule.keyword_pattern);
    if (text.includes(pattern)) {
      const confidence = Number(rule.confidence_score);
      return {
        fw_related: rule.fw_related,
        complexity_level_id: rule.fw_related ? rule.complexity_level_id : null,
        classification_method: 'RULE',
        confidence_score: confidence,
        classification_reason: `Matched rule ${rule.rule_code} (keyword: "${rule.keyword_pattern}")`,
        status: rule.fw_related ? 'CLASSIFIED' : 'NON_FIRMWARE',
        rule_id: rule.id,
        match_score: confidence / 100,
      };
    }
  }

  // 3) UNKNOWN → Coder Review
  return {
    fw_related: null,
    complexity_level_id: null,
    classification_method: 'MANUAL',
    confidence_score: null,
    classification_reason: 'No exact or rule match found. Requires coder review.',
    status: 'CODER_REVIEW',
    kb_item_id: null,
    rule_id: null,
    match_score: 0,
  };
};

module.exports = { decideBest, contextNote, diceMinJaccard, labelForTier };
