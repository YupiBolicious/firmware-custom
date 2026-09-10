/**
 * Domain-aware token policy (single source of truth for all matching text).*/

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

const CODE_GATE_STRENGTH = {
  MODEL_CODE_MISMATCH: 'block',
  VERSION_MISMATCH: 'block',
  SERIAL_MISMATCH: 'block',
  MEASUREMENT_MISMATCH: 'block',
};

const MEASUREMENT_SUFFIX = /(mm|cm|ma|lux|volt|volts|pcs|hz|khz|sn|m\/s)$/;

const canonicalCode = (token) => token.toLowerCase().replace(/[-./]/g, '');

const isCodeToken = (raw) => {
  if (!raw || raw.length < 2) return false;
  if (/^\d{1,3}$/.test(raw)) return false;
  if (/^\d+$/.test(raw)) return false;
  const t = raw.toLowerCase();
  if (/[a-z]\d|\d[a-z]/i.test(t)) return true;
  if (/[-./]/.test(t) && /[a-z0-9].*[a-z0-9]/i.test(t)) return true;
  return false;
};

const extractCodeTokens = (text) => {
  const out = new Set();
  for (const raw of String(text || '').split(/[\s,;]+/).filter(Boolean)) {
    if (isCodeToken(raw)) out.add(canonicalCode(raw));
  }
  return out;
};

const classifyCodeReason = (code) => {
  if (/^sn/i.test(code) || /\d{6,}/.test(code)) return 'SERIAL_MISMATCH';
  if (/^v\d/.test(code) || /\d+\.\d+/.test(code)) return 'VERSION_MISMATCH';
  if (MEASUREMENT_SUFFIX.test(code)) return 'MEASUREMENT_MISMATCH';
  return 'MODEL_CODE_MISMATCH';
};

const checkCodeAgreement = (itemCodes, kbCodes, strength = CODE_GATE_STRENGTH) => {
  const item = itemCodes instanceof Set ? itemCodes : new Set(itemCodes || []);
  const kb = kbCodes instanceof Set ? kbCodes : new Set(kbCodes || []);
  const failed = [];
  for (const token of kb) {
    if (!item.has(token)) {
      const reason = classifyCodeReason(token);
      failed.push({ token, reason, strength: (strength && strength[reason]) || 'block' });
    }
  }
  const blocking = failed.filter((f) => f.strength === 'block');
  return { pass: blocking.length === 0, failed, reasons: [...new Set(failed.map((f) => f.reason))] };
};

module.exports = {
  FUNCTIONAL, PROTECTED, CANONICAL,
  normalize, tokenize, buildKeywords, canonicalize, isNoise, singularize,
  diceBigram,
  CTX_SAME_MODEL_VERSION, CTX_SAME_MODEL, CTX_CROSS_MODEL, contextBonus,
  CODE_GATE_STRENGTH, extractCodeTokens, checkCodeAgreement, classifyCodeReason,
};
