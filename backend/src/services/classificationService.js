const classificationRepository = require('../repositories/classificationRepository');
const { normalize, tokenize } = require('../utils/textUtils');

// Jaccard similarity between two token sets
const jaccard = (setA, setB) => {
  if (setA.size === 0 && setB.size === 0) return 1;
  const union = new Set([...setA, ...setB]);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  return intersection / union.size;
};

/**
 * Classify a single item.
 * Flow: EXACT_MATCH (KB) → RULE (classification_rules) → UNKNOWN (coder review)
 * Returns { fw_related, complexity_level_id, classification_method, confidence_score, classification_reason, status }
 */
const classifyItem = async (item) => {
  const text = normalize(`${item.title} ${item.description || ''}`);
  const tokens = tokenize(`${item.title} ${item.description || ''}`);

  // Load reference data
  const [kbItems, rules] = await Promise.all([
    classificationRepository.findAllKbItems(),
    classificationRepository.findAllRules(),
  ]);

  // 1) EXACT MATCH against KB
  let bestKb = null;
  let bestKbScore = 0;
  for (const kb of kbItems) {
    const kbTokens = tokenize(`${kb.title} ${kb.description || ''} ${kb.keywords || ''}`);
    const score = jaccard(tokens, kbTokens);
    if (score > bestKbScore) {
      bestKbScore = score;
      bestKb = kb;
    }
  }

  // AUTO CLASSIFY FOR EXACT MATCH
  if (bestKb && bestKbScore >= 0.6) {
    // const confidence = Math.min(Number(bestKb.confidence_score), 99);
    //or limited by similarity
    const confidenceBySimilarity =  Math.min(bestKbScore * 100, Number(bestKb.confidence_score), 99);
    return {
      fw_related: bestKb.fw_related,
      complexity_level_id: bestKb.fw_related ? bestKb.complexity_level_id : null,
      classification_method: 'EXACT_MATCH', //consider using similarity score as well -> 'SIMILARITY'
      confidence_score: confidenceBySimilarity,
      classification_reason: `Exact match with knowledge base item ${bestKb.kb_code} (similarity ${(bestKbScore * 100).toFixed(0)}%)`,
      status: bestKb.fw_related ? 'CLASSIFIED' : 'NON_FIRMWARE',
      kb_item_id: bestKb.id,
      match_score: bestKbScore,
    };
  }

  // 1b) SIMILARITY match — partial KB overlap, below exact threshold.
  //     Suggests the best KB item but requires coder review to confirm.
  if (bestKb && bestKbScore >= 0.35) {
    return {
      fw_related: null,
      complexity_level_id: null,
      classification_method: 'SIMILARITY',
      confidence_score: null,
      classification_reason: `Similar to knowledge base item ${bestKb.kb_code} (similarity ${(bestKbScore * 100).toFixed(0)}%). Requires coder review.`,
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

/**
 * Test a single KB item against sample text.
 * Returns { score, tokens_a, tokens_b, intersection, union, verdict }
 */
const testKbItem = async (kbItemId, sampleText) => {
  const kbItems = await classificationRepository.findAllKbItems();
  const kb = kbItems.find((k) => k.id === Number(kbItemId));
  if (!kb) return null;

  const itemTokens = tokenize(sampleText);
  const kbTokens = tokenize(`${kb.title} ${kb.description || ''} ${kb.keywords || ''}`);
  const union = new Set([...itemTokens, ...kbTokens]);
  const intersection = [...itemTokens].filter((t) => kbTokens.has(t));

  let verdict = 'NO_MATCH';
  if (kb.fw_related === false) verdict = 'NON_FIRMWARE';
  else if (intersection.length / union.size >= 0.60) verdict = 'EXACT_MATCH';
  else if (intersection.length / union.size >= 0.35) verdict = 'SIMILARITY';

  return {
    kb_item_id: kb.id,
    kb_code: kb.kb_code,
    title: kb.title,
    score: intersection.length / union.size,
    intersection,
    union_size: union.size,
    item_tokens: [...itemTokens],
    kb_tokens: [...kbTokens],
    verdict,
    fw_related: kb.fw_related,
    complexity_level_id: kb.complexity_level_id,
  };
};

module.exports = { classifyItem, testKbItem };