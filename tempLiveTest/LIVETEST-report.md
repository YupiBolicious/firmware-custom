# Live End-to-End Full Flow Test — Work Order + WOI Creation → COMPLETE & Notification Verification

Date: 2026-09-03
Location: `tempLiveTest/` (scripts + report)
Backend: `localhost:5000` (started for the test, stopped after)

## Result
**68 PASS / 0 FAIL.** Both scratch work orders driven from creation through **COMPLETED**; notifications verified on **all 4 users** via settled DB state and the live `/api/notifications` endpoint. Real work orders untouched.

## Users & roles
| id | user | role |
|---|---|---|
| 1 | pm@demo | PM (owner of both test WOs) |
| 2 | coder@demo | CODER (review + production) |
| 3 | admin@demo | ADMIN |
| 16 | pm@test | PM (grantee on WO-A) |

## Scratch work orders created (left for manual review)
| WO | id | numbers | status |
|---|---|---|---|
| WO-A (clean, no review) | 33 | `LIVETEST-A-1788402740033` | COMPLETED |
| WO-B (with coder-review) | 34 | `LIVETEST-B-1788402740033` | COMPLETED |

Work-order items (WOIs): A → 3 items (58,59,60); B → 2 items (61,62). Production tasks generated at finalize: A=3, B=2; all completed; both WOs finalized/COMPLETED with no open tasks.

## Full flow exercised (per WO)
1. **Create (PM)** `POST /api/work-orders` → 201 `DRAFT` + group (no notification on create — confirmed 0).
2. **Grant access (WO-A only)** `POST /:id/access` user 16 → 200; `ACCESS_GRANTED` → {1,16}.
3. **Add items (WOIs)** `POST /:id/items` → 201, auto item numbers.
4. **Analyze (PM)** `POST /:id/analyze` → 200 `ANALYZED` + classifications.
   - A: all `CLASSIFIED` (no `CODER_REVIEW` notification).
   - B: `Mergepoint` → `CODER_REVIEW` → `CODER_REVIEW` notification → {2,3}.
5. **Coder review (CODER)** `POST /items/:id/review` (L2) → 200; `ITEM_REVIEWED` → {1}; re-analyze → all `CLASSIFIED`.
6. **Finalize (PM)** `POST /:id/finalize` → 200 `FINALIZED` + production tasks.
7. **Start production (CODER)** → 200 `PRODUCTION` (PM → **403**).
8. **Complete each task (CODER)** → 200.
9. **Complete production (CODER)** → 200 `COMPLETED`; no open tasks.

## Notification matrix (settled DB — authoritative)
| WO | Notification | Recipients |
|---|---|---|
| A (33) | ACCESS_GRANTED | {1,16} |
| A (33) | WO_FINALIZED | {1,2,3,16} |
| A (33) | WO_COMPLETED | {1,2,3,16} |
| B (34) | CODER_REVIEW | {2,3} |
| B (34) | ITEM_REVIEWED | {1} |
| B (34) | WO_FINALIZED | {1,2,3} |
| B (34) | WO_COMPLETED | {1,2,3} |

Per-user totals (DB rows):
- user 1 (pm@demo): ACCESS_GRANTED ×1, WO_FINALIZED ×2, WO_COMPLETED ×2, ITEM_REVIEWED ×1
- user 2 (coder@demo): WO_FINALIZED ×2, WO_COMPLETED ×2, CODER_REVIEW ×1
- user 3 (admin@demo): WO_FINALIZED ×2, WO_COMPLETED ×2, CODER_REVIEW ×1
- user 16 (pm@test): ACCESS_GRANTED ×1, WO_FINALIZED ×1, WO_COMPLETED ×1

Every user received both **WO_FINALIZED** and **WO_COMPLETED**; each user's notifications are visible through `GET /api/notifications`.

## Notes / findings
- **Notification design confirmed:** create sends none; analyze→`CODER_REVIEW` goes to all admins+coders; item review→`ITEM_REVIEWED` to owner+grantees; finalize/complete→`WO_FINALIZED`/`WO_COMPLETED` to owner+grantees+admins+coders. Role split held: PM cannot start production (403), CODER cannot finalize/analyze.
- **Harness caveat:** an early version of this script sampled the DB *immediately* after mutating calls and reported 2 transient false-negatives (notifications inserted by the server not yet visible to the sampling connection). Re-verification against the settled DB (and via the API) showed all expected rows present — no application defect. The final script verifies notifications only after the flow settles.
- Data intentionally **left in place** for manual inspection (WO 33 & 34 + all notifications).

## Files
- `tempLiveTest/liveFullFlow.js` — the test runner (re-runnable).
- `tempLiveTest/_results.json` — machine-readable run result.
- `tempLiveTest/LIVETEST-report.md` — this report.
