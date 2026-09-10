const { normalize, tokenize, contextBonus, diceBigram } = require('../utils/tokenPolicy');

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

// Two-stage score: text retrieval first, structured model/version context
// re-ranks after. Serial numbers never participate in matching.
const scorePair = (itemTitle, itemDesc, kb, itemCtx) => {
  const kbTokens = kb.tokens instanceof Set
    ? kb.tokens
    : tokenize(`${kb.title} ${kb.description || ''} ${kb.keywords || ''}`);
  const kbTitle = typeof kb.normTitle === 'string' ? kb.normTitle : (kb.title || '');
  const fullTokens = tokenize(`${itemTitle} ${itemDesc || ''}`);
  const titleTokens = tokenize(itemTitle);
  const fullScore = Math.max(
    jaccard(fullTokens, kbTokens),
    diceBigram(`${itemTitle} ${itemDesc || ''}`, kbTitle)
  );
  const jTitle = jaccard(titleTokens, kbTokens);
  const titleScore = Math.max(
    jTitle,
    diceBigram(itemTitle, kbTitle)
  );
  const textScore = Math.max(fullScore, titleScore);
  const bonus = contextBonus(kb, itemCtx);
  return { textScore, fullScore, titleScore, jTitle, bonus, score: Math.min(1, textScore + bonus), kbTokens };
};

const selectCandidates = (preparedRows) => preparedRows;

const scoreCandidates = (itemTitle, itemDesc, kbItems, itemCtx) => {
  const fullTokens = tokenize(`${itemTitle} ${itemDesc || ''}`);
  const kbTokenSet = (kb) => (kb.tokens instanceof Set
    ? kb.tokens
    : tokenize(`${kb.title} ${kb.description || ''} ${kb.keywords || ''}`));
  let bestKb = null;
  let bestKbScore = 0;
  let bestKbBonus = 0;
  let bestKbJTitle = 0;
  let secondBestScore = 0;
  let coverageCount = 0;
  let coveredKb = null;
  for (const kb of selectCandidates(kbItems)) {
    const { score, bonus, jTitle } = scorePair(itemTitle, itemDesc, kb, itemCtx);
    if (score > bestKbScore) {
      secondBestScore = bestKbScore;
      bestKbScore = score;
      bestKbBonus = bonus;
      bestKbJTitle = jTitle;
      bestKb = kb;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
    if (fullTokens.size > 0) {
      const rowTokens = kbTokenSet(kb);
      let covered = true;
      for (const t of fullTokens) {
        if (!rowTokens.has(t)) { covered = false; break; }
      }
      if (covered) {
        coverageCount++;
        if (coverageCount === 1) coveredKb = kb;
      }
    }
  }
  let sharedCount = 0;
  if (coveredKb) {
    const rowTokens = kbTokenSet(coveredKb);
    for (const t of fullTokens) {
      if (rowTokens.has(t)) sharedCount++;
    }
  }
  return {
    bestKb, bestKbScore, bestKbBonus, bestKbJTitle, secondBestScore,
    lexicalMargin: bestKb ? Math.max(0, bestKbScore - secondBestScore) : 0,
    coverageCount, coveredKb, sharedCount,
  };
};

module.exports = { normalize, tokenize, jaccard, scorePair, selectCandidates, scoreCandidates };
