const crypto = require('crypto');
const classificationRepository = require('../repositories/classificationRepository');
const kbCache = require('../services/kbCache');
const { normalize, tokenize, contextBonus, diceBigram } = require('../utils/tokenPolicy');
const { jaccard, scorePair, selectCandidates, scoreCandidates } = require('../services/matcher');
const { decideBest, labelForTier } = require('../services/decider');

const inputHash = (item) => {
  const parts = [
    normalize(item.title || ''),
    normalize(item.description || ''),
    String(item.quantity || 1),
    item.machine_model_id == null ? '' : String(item.machine_model_id),
    item.machine_model_version_id == null ? '' : String(item.machine_model_version_id),
    item.documentation_readiness || '',
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 64);
};

//classify each items on wo against kb and rules.
const classifyItem = async (item, refs) => {
  const text = normalize(`${item.title} ${item.description || ''}`);
  const itemCtx = {
    machine_model_id: item.machine_model_id ?? null,
    machine_model_version_id: item.machine_model_version_id ?? null,
  };

  // Reference data loads once per analyze call when refs are passed in.
  // Cache-backed prepared rows are preferred; raw rows still work.
  const [kbItems, rules] = refs
    ? [selectCandidates(refs.kbItems), refs.rules]
    : await Promise.all([
      selectCandidates((await kbCache.getPreparedKb()).rows),
      classificationRepository.findAllRules(),
    ]);

  // 1) EXACT MATCH against KB
  const { bestKb, bestKbScore, bestKbBonus, bestKbJTitle, coverageCount, coveredKb, sharedCount } =
    scoreCandidates(item.title, item.description, kbItems, itemCtx);

  return decideBest({ bestKb, bestKbScore, bestKbBonus, bestKbJTitle, coverageCount, coveredKb, sharedCount, rules, text });
};

/**
 * Test a single KB item against sample text.
 * Returns { score, tokens_a, tokens_b, intersection, union, verdict }
 */
const testKbItem = async (kbItemId, sampleText) => {
  const prepared = await kbCache.getPreparedKb();
  const kb = prepared.rows.find((k) => k.id === Number(kbItemId));
  if (!kb) return null;

  const itemTokens = tokenize(sampleText);
  const { score, kbTokens, jTitle } = scorePair(sampleText, '', kb, null);
  const union = new Set([...itemTokens, ...kbTokens]);
  const intersection = [...itemTokens].filter((t) => kbTokens.has(t));

  let verdict = 'NO_MATCH';
  if (kb.fw_related === false) verdict = 'NON_FIRMWARE';
  else {
    const tierLabel = labelForTier({
      score,
      isIdentity: normalize(sampleText) === normalize(`${kb.title} ${kb.description || ''}`),
      jTitle,
    });
    if (tierLabel) verdict = tierLabel;
  }

  return {
    kb_item_id: kb.id,
    kb_code: kb.kb_code,
    title: kb.title,
    score,
    intersection,
    union_size: union.size,
    item_tokens: [...itemTokens],
    kb_tokens: [...kbTokens],
    verdict,
    fw_related: kb.fw_related,
    complexity_level_id: kb.complexity_level_id,
  };
};

module.exports = { classifyItem, testKbItem, scorePair, jaccard, inputHash, selectCandidates };