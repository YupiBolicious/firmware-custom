const classificationService = require('../services/classificationService');
const shadowClassify = require('../services/shadowClassify');

const PATH_LEXICAL = 'lexical';
const PATH_SEMANTIC = 'semantic';
const PATH_REVIEW = 'review';

const classifyFlow = async (item, refs) => {
  const lexical = await classificationService.classifyItem(item, refs);
  if (lexical.status !== 'CODER_REVIEW') {
    return { path: PATH_LEXICAL, result: lexical, semantic: null, assist: null };
  }
  const wrapped = await shadowClassify.classifyWithShadow(item, refs, lexical);
  if (wrapped.assist) {
    return { path: PATH_SEMANTIC, result: lexical, semantic: wrapped.semantic, assist: wrapped.assist };
  }
  return { path: PATH_REVIEW, result: lexical, semantic: wrapped.semantic, assist: null };
};

module.exports = { classifyFlow, PATH_LEXICAL, PATH_SEMANTIC, PATH_REVIEW };
