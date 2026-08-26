{/*implement normalized, tokenized and buildKeywords from 
  title, desc, and extra keyword manual input from user  */}
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'with', 'in', 'on',
  'change', 'update', 'add', 'new', 'adjust',
]);

const normalize = (text) => {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const tokenize = (text) => {
  return new Set(normalize(text).split(' ').filter(Boolean));
};

const buildKeywords = (title, description, extra) => {
  const words = [...tokenize(`${title} ${description || ''}`)]
    .filter((word) => !STOPWORDS.has(word));
  const extras = normalize(extra).split(' ').filter(Boolean);
  return [...new Set([...words, ...extras])].join(',');
};

module.exports = { normalize, tokenize, buildKeywords };
