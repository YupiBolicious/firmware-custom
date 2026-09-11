const DECIDED_ACTION = 'CLASSIFY_DECIDED';
const REVIEWED_ACTION = 'CLASSIFY_REVIEWED';

const asNum = (v) => (v == null ? null : Number(v));

const buildDecidedDetails = ({ path, result, semantic, assist, lexical, decisionBlocked, classificationId, kbVersion, kbById }) => {
  const top = semantic && semantic.topMatches && semantic.topMatches[0];
  const suggestedKbId = result ? result.kb_item_id : null;
  const suggestedRow = suggestedKbId != null && kbById ? kbById.get(suggestedKbId) : null;
  return {
    path: path || null,
    classification_id: classificationId != null ? classificationId : null,
    kb_version: kbVersion != null ? kbVersion : null,
    lexical_method: lexical ? lexical.classification_method : null,
    lexical_status: lexical ? lexical.status : null,
    decision_method: result ? result.classification_method : null,
    decision_status: result ? result.status : null,
    suggested_kb_id: suggestedKbId != null ? suggestedKbId : null,
    suggested_kb_code: suggestedRow ? suggestedRow.kb_code : null,
    suggested_complexity_id: suggestedRow ? suggestedRow.complexity_level_id : null,
    suggested_fw: suggestedRow ? suggestedRow.fw_related : null,
    semantic_margin: semantic ? asNum(semantic.margin) : null,
    semantic_top_kb: top ? top.kbCode : null,
    semantic_top_score: top ? asNum(top.score) : null,
    block_reason: decisionBlocked ? decisionBlocked.reason : null,
    block_detail: decisionBlocked && decisionBlocked.detail !== undefined ? decisionBlocked.detail : null,
    assist_kb_code: assist ? assist.kb_code : null,
  };
};

const buildReviewedDetails = ({ classificationId, finalFw, finalComplexityId, levelCode, suggestionMethod, suggestionKbId }) => ({
  classification_id: classificationId != null ? classificationId : null,
  suggestion_method: suggestionMethod || null,
  suggestion_kb_id: suggestionKbId != null ? suggestionKbId : null,
  final_fw: finalFw != null ? finalFw : null,
  final_complexity_id: finalComplexityId != null ? finalComplexityId : null,
  final_level_code: levelCode || null,
});

const scoreOutcome = ({ suggestionComplexityId, suggestionFw, finalComplexityId, finalFw }) => {
  if (suggestionComplexityId == null && suggestionFw == null) return 'NO_SUGGESTION';
  const sameComplexity = asNum(suggestionComplexityId) === asNum(finalComplexityId);
  const sameFw = (suggestionFw == null || finalFw == null) ? true : suggestionFw === finalFw;
  return sameComplexity && sameFw ? 'CONFIRMED' : 'OVERRIDDEN';
};

module.exports = {
  DECIDED_ACTION,
  REVIEWED_ACTION,
  buildDecidedDetails,
  buildReviewedDetails,
  scoreOutcome,
};
