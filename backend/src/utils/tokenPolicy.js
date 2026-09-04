/**
 * Domain-aware token policy (single source of truth for all matching text).
 *
 * Replaces the old flat STOPWORDS concept with tiered handling:
 *  - Tier 0 PROTECTED  : domain verbs / firmware nouns / codes — never dropped.
 *  - Tier 1 FUNCTIONAL : pure English function words — always dropped.
 *  - Tier 2 CANONICAL  : explicit synonym map to a canonical form (precise,
 *                        hand-picked; NOT a generic stemmer, so part/model
 *                        codes are never mangled).
 *  - Tier 3 NOISE      : digit/serial artifacts dropped (long pure numbers,
 *                        single-letter fragments from punctuation stripping).
 *
 * `normalize` is byte-identical to the legacy one so RULE substring matching
 * (which relies on it) is unaffected. Only token selection changes.
 */

const FUNCTIONAL = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'with', 'in', 'on',
  'is', 'are', 'be', 'by', 'from', 'as', 'at', 'it', 'its', 'this', 'that',
]);

const PROTECTED = new Set([
  'change', 'update', 'add', 'new', 'adjust', 'modify', 'implement',
  'configure', 'create', 'remove', 'fix', 'improve',
  'firmware', 'alarm', 'setpoint', 'bootloader', 'menu', 'tree', 'usecase',
  'closed', 'loop', 'control', 'hardware', 'board', 'architecture',
  'ui', 'text', 'cosmetic', 'label', 'mechanical', 'packaging', 'io',
]);

const CANONICAL = {
  configuration: 'config', configure: 'config', configs: 'config', config: 'config',
  modifies: 'modify', modification: 'modify', modifications: 'modify', modify: 'modify',
  implementation: 'implement', implements: 'implement', implement: 'implement',
  updates: 'update', updated: 'update', update: 'update',
  changes: 'change', changed: 'change', change: 'change',
  adjusts: 'adjust', adjustment: 'adjust', adjust: 'adjust',
  adds: 'add', added: 'add', add: 'add',
  creates: 'create', created: 'create', create: 'create',
  removes: 'remove', removed: 'remove', remove: 'remove',
  usecase: 'usecase', use: 'usecase', case: 'usecase',
};

const normalize = (text) => {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const isNoise = (token) => {
  if (token.length <= 1) return true;
  if (/^\d{4,}$/.test(token)) return true;
  return false;
};

const singularize = (token) => {
  if (token.length <= 4) return token;
  if (/\d/.test(token)) return token;
  if (token.endsWith('ies') && token.length > 5) return token.slice(0, -3) + 'y';
  if (/(ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !/(ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
};

const canonicalize = (token) => CANONICAL[token] || singularize(token);

const bigrams = (s) => {
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
};

const diceBigram = (a, b) => {
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length < 5 || nb.length < 5) return 0;
  const ba = bigrams(na);
  const bb = new Map();
  for (const g of bigrams(nb)) bb.set(g, (bb.get(g) || 0) + 1);
  let inter = 0;
  for (const g of ba) {
    const left = bb.get(g) || 0;
    if (left > 0) { inter++; bb.set(g, left - 1); }
  }
  if (ba.length + bigrams(nb).length === 0) return 0;
  return (2 * inter) / (ba.length + bigrams(nb).length);
};

const tokenize = (text) => {
  const out = new Set();
  for (const raw of normalize(text).split(' ').filter(Boolean)) {
    if (FUNCTIONAL.has(raw)) continue;
    if (isNoise(raw)) continue;
    out.add(canonicalize(raw));
  }
  return out;
};

const buildKeywords = (title, description, extra) => {
  const words = [...tokenize(`${title} ${description || ''}`)];
  const extras = normalize(extra).split(' ').filter(Boolean)
    .filter((w) => !FUNCTIONAL.has(w) && !isNoise(w))
    .map(canonicalize);
  return [...new Set([...words, ...extras])].join(',');
};

const CTX_SAME_MODEL_VERSION = 0.10;
const CTX_SAME_MODEL = 0.05;
const CTX_CROSS_MODEL = -0.10;

const contextBonus = (kb, item) => {
  if (kb == null || item == null) return 0;
  if (kb.machine_model_id == null || item.machine_model_id == null) return 0;
  if (Number(kb.machine_model_id) !== Number(item.machine_model_id)) return CTX_CROSS_MODEL;
  const kbVer = kb.machine_model_version_id == null ? null : Number(kb.machine_model_version_id);
  const itemVer = item.machine_model_version_id == null ? null : Number(item.machine_model_version_id);
  if (kbVer !== null && kbVer === itemVer) return CTX_SAME_MODEL_VERSION;
  return CTX_SAME_MODEL;
};

module.exports = {
  FUNCTIONAL, PROTECTED, CANONICAL,
  normalize, tokenize, buildKeywords, canonicalize, isNoise, singularize,
  diceBigram,
  CTX_SAME_MODEL_VERSION, CTX_SAME_MODEL, CTX_CROSS_MODEL, contextBonus,
};
