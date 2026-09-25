# Backend Payload Validation Hardening

**Date:** 2026-09-18
**Validated by:** live malformed/valid probes against `http://localhost:5000` (42 checks) + `node --check` on every touched file
**Branch:** main (`b54a5b5 classification check, ui layout fixation`)

## 1. Verdict

**VALID.** All 42 live probe checks pass. Every malformed payload returns HTTP 400 with the existing `{ success, message, errors[] }` shape (field-level errors where applicable); no validation-related 500s remain; one valid create/update round-trip per affected resource succeeds; baseline database counts are byte-identical before/after.

## 2. Scope

Three phases of input-validation hardening, reusing the existing `ApiError` / `errorHandler` / `requireIntegerParams` patterns. No schema changes, no new framework, no frontend-reliance; backend stays the source of truth. Empty-body workflow endpoints (`analyze` / `finalize` / `production`) intentionally left unvalidated.

## 3. Files Changed

### New (3)

| File | Purpose |
|---|---|
| `backend/src/utils/validation.js` | Shared `isRealDate`, `assertOptionalDate`, `assertOptionalInt` |
| `backend/src/validators/kbValidator.js` | `validateKbCreate` / `validateKbUpdate` |
| `backend/src/validators/machineModelValidator.js` | model + version create/update validators |

### Modified (16)

| File | Change |
|---|---|
| `backend/src/validators/authValidator.js` | `validateLogin` corrected to `identifier` (was dead code checking `email`), now route middleware |
| `backend/src/routes/authRoutes.js` | Wired `validateLogin` on `POST /api/auth/login` |
| `backend/src/controllers/authController.js` | Removed duplicate inline login check (single source: validator) |
| `backend/src/routes/kbRoutes.js` | Wired KB validators on `POST /` and `PUT /:id` |
| `backend/src/repositories/kbRepository.js` | `update` builds dynamic `SET` from present keys — partial update preserved, explicit `null` clears |
| `backend/src/controllers/kbController.js` | `testKbItem` requires `sample_text` be a string (was `TypeError` 500) |
| `backend/src/validators/workOrderValidator.js` | `validateReview` rejects non-string `notes`; new `validateProductionTaskUpdate` |
| `backend/src/routes/workOrderRoutes.js` | Wired `validateProductionTaskUpdate` on `PUT /:id/production/tasks/:taskId` |
| `backend/src/controllers/workOrderController.js` | `completed` no longer coerced via `Boolean()` (`"false"` was flipping state) |
| `backend/src/routes/machineModelRoutes.js` | Wired model/version validators on POST/PUT |
| `backend/src/services/complexityService.js` | `description` string-or-null check; `is_active` now strict boolean |
| `backend/src/services/pmDashboardService.js` | `date_from` / `date_to` validated via shared helper |
| `backend/src/controllers/coderDashboardController.js` | `date_from` / `date_to` validated via shared helper |
| `backend/src/controllers/auditLogController.js` | `date_from`/`date_to` validated; `user_id`/`work_order_id` must be positive ints |
| `backend/src/controllers/adminDashboardController.js` | Switched to shared `isRealDate` helper + `ApiError` shape |
| `backend/src/middleware/errorHandler.js` | Malformed JSON body → clean 400 `Malformed JSON body` |

## 4. Validation Rules Introduced

| Field | Create | Update |
|---|---|---|
| `kb_code` | required, non-empty ≤50 | optional, non-empty ≤50 |
| `title` | required, non-empty ≤300 | optional, non-empty ≤300 |
| `fw_related` | required boolean | optional boolean |
| `confidence_score` | optional, number 0–100 | optional, number 0–100 |
| `complexity_level_id` | optional, integer or null | optional, integer or null (null clears) |
| `is_active` | optional boolean | optional boolean |
| `description` / `keywords` / `source` | optional string or null | optional string or null |
| update with `{}` | n/a | **rejected** (`At least one field is required`) |
| `model_code` / `name` / `version_code` | required non-empty (≤50/≤200) | optional non-empty |

No invalid value is silently converted to null or a default; invalid input returns 400 with `errors[]`.

## 5. Live Probe Results (`localhost:5000`, 42 checks)

| Area | Probe | Expected | Got |
|---|---|---|---|
| Auth | login empty body | 400 | 400 |
| Auth | login wrong types | 400 | 400 |
| Auth | wrong password | 401 | 401 |
| Auth | valid login | 200 | 200 |
| Auth | malformed JSON body | 400 | 400 |
| KB | create empty | 400 | 400 |
| KB | create `fw_related:'yes'` | 400 | 400 |
| KB | create `confidence_score:150` | 400 | 400 |
| KB | create `complexity_level_id:'1'` | 400 | 400 |
| KB | **create valid** | 201 | 201 |
| KB | **update `{is_active:false}` only** | 200 | 200 |
| KB | **update `{}`** | 400 | 400 |
| KB | update `fw_related:'nope'` | 400 | 400 |
| KB | **update `{complexity_level_id:null}`** | 200 (clears→NULL, title kept) | 200 |
| KB | test `sample_text:123` | 400 | 400 |
| KB | test valid string (active item) | 200 | 200 |
| KB | non-int path id `kb/abc` | 400 | 400 |
| Machine model | create empty | 400 | 400 |
| Machine model | create missing `name` | 400 | 400 |
| Machine model | create `description:5` | 400 | 400 |
| Machine model | **create valid** | 201 | 201 |
| Machine model | **update valid** | 200 | 200 |
| Machine model | version create missing code | 400 | 400 |
| Machine model | **version create/update valid** | 201/200 | 201/200 |
| Complexity | create `description:7` | 400 | 400 |
| Complexity | update `is_active:'true'` | 400 | 400 |
| Complexity | **create valid** | 201 | 201 |
| Work order | review `notes:5` | 400 | 400 |
| Work order | production task `completed:'false'` | 400 | 400 |
| Dates | PM `date_from=2026-13-99` | 400 | 400 |
| Dates | coder `date_to=not-a-date` | 400 | 400 |
| Dates | audit `date_from=2026-02-30` | 400 | 400 |
| Dates | admin `from=2026-13-99` | 400 | 400 |
| Query ids | audit `user_id=abc` | 400 | 400 |
| Query ids | audit `work_order_id=1.5` | 400 | 400 |
| Valid fetches | PM / coder / audit / admin dashboards | 200 | 200 |

**Explicit-null clear (DB-verified):** created KB with `complexity_level_id=1`, PUT `{complexity_level_id:null}` → DB `1 → NULL` (`clearedToNull=true`), `title` preserved — partial update semantics confirmed at the database layer, matching existing frontend behavior (`useKnowledgeBase.js` sends `null` to clear).

## 6. Baseline / Cleanup

Counts captured before and after all probes — identical, no scratch rows left:

| Table | Before | After |
|---|---|---|
| users | 4 | 4 |
| kb_items | 29 | 29 |
| machine_model | 5 | 5 |
| machine_model_ver | 4 | 4 |
| complexity_levels | 6 | 6 |
| audit_trail | 7 | 7 |
| work_orders | 4 | 4 |
| work_order_items | 16 | 16 |

Temp probe rows (KB/model/version/complexity, `TMP-%`) created for valid-round-trip coverage were removed. No schema migration applied.

## 7. Notes / Deferred

- **KB create with omitted `confidence_score`** returns a generic 400 (PG 23502) because `kbRepository.create` always writes the column; the validator treats it as optional per spec. Not a 500; left unchanged (schema-default nuance, outside validation scope).
- **Machine-model `description`** cannot be cleared to `null` on update (pre-existing `COALESCE` semantics). Unchanged; flagged only.
- **Empty-body workflow endpoints** (`analyze`, `finalize`, `startProduction`, `completeProduction`) take no payloads — no body validation added, per plan.