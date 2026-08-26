# Plan: Seed-quality keywords for coder-learned KB items

Status: APPROVED by user (auto-extract + coder input, textUtils.js layout). Execution blocked by permission config (`edit * -> deny`). Re-run when edit permission granted.

## Goal
`upsertCoderLearning` currently stores `[title, description].join(', ')` as keywords — a dead duplicate of title+description that adds zero Jaccard signal. Replace with normalized/stopword-filtered extraction matching seed-data format, plus optional coder-supplied keywords.

## Constraints
- No DB migration: `kb_items.keywords` column unchanged, same comma-separated TEXT format.
- Stopword filtering applies ONLY to stored keywords. `classifyItem` keeps tokenizing raw title+desc so existing match scores are unaffected.
- No comments added to code (repo rule).

## File changes

### 1. NEW backend/src/utils/textUtils.js
```js
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
```

### 2. backend/src/services/classificationService.js
Replace lines 1-15 header block with:
```js
const classificationRepository = require('../repositories/classificationRepository');
const { normalize, tokenize } = require('../utils/textUtils');
```
(Delete local normalize/tokenize definitions. Zero behavior change.)

### 3. backend/src/services/workOrderService.js
- Add import after line 7 (`kbRepository` require):
  `const { buildKeywords } = require('../utils/textUtils');`
- Line 19 signature: add `keywords` to destructure:
  `const reviewItem = async (itemId, { complexity_level_id, notes, keywords, user_id, ip_address }) => {`
- In upsertCoderLearning call (~line 58), append field:
  `keywords: buildKeywords(item.title, item.description, keywords),`

### 4. backend/src/repositories/kbRepository.js (upsertCoderLearning)
- Destructure adds `keywords`.
- VALUES confidence `100` -> `99` (classifyItem caps at 99 anyway).
- Params: replace `[title, description].filter(Boolean).join(', ')` with `keywords || null`.
- ON CONFLICT DO UPDATE: add `keywords = EXCLUDED.keywords,`.

### 5. backend/src/validators/workOrderValidator.js
Add before module.exports:
```js
const validateReview = (req, res, next) => {
  const { complexity_level_id, keywords } = req.body || {};
  const errors = [];

  if (!Number.isInteger(complexity_level_id)) {
    errors.push('complexity_level_id is required');
  }
  if (keywords !== undefined && (typeof keywords !== 'string' || keywords.length > 500)) {
    errors.push('keywords must be a string of max 500 characters');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};
```
Export `validateReview`.

### 6. backend/src/routes/workOrderRoutes.js
- Add `validateReview` to validator require block.
- Line 23: insert middleware ->
  `router.post('/items/:itemId/review', authorize('CODER'), validateReview, workOrderController.reviewItem);`

### 7. frontend/src/pages/ReviewQueue.jsx
- State: `const [keywordInputs, setKeywordInputs] = useState({});`
- review() POST body: `{ complexity_level_id, keywords: keywordInputs[item.item_id]?.trim() || undefined }`
- Table: add `<th>Keywords</th>` after Complexity; new cell with text input bound to keywordInputs.

### Untouched
workOrderController.js (spreads req.body already), DB schema, KnowledgeBase.jsx admin UI.

## Verification (after applying)
1. `node --check` on files 1-6.
2. Restart API. Login coder@demo / password123.
3. Analyze WO-2026-001 -> ITEM-003 ("Add new adaptive control logic") goes CODER_REVIEW.
4. Review queue: confirm L4 + optional keywords -> expect learned row KB-CODER-<id> with `adaptive,control,logic,firmware` style keywords in GET /api/kb.
5. Create similar item, re-analyze -> expect SIMILARITY/EXACT_MATCH vs learned entry.
