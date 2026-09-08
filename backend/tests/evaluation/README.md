# Phase 3 — Automated Real-World Evaluation

## Run

```bash
node scripts/evaluate-classifier.js
```

No backend server needed — the script talks to PostgreSQL directly and imports the
production classifier (`classificationService.classifyItem`) exactly as `analyze`
uses it (same scorer, same prepared-KB cache, same thresholds). The classifier is
not changed by this tool. Exit code is non-zero only if the evaluation itself
fails (DB down, bad dataset shape, gate crash) — never because predictions are wrong.

## Current state

- KB items available: see the script's `KB items:` line (was 16 active at build time,
  not 28 — confirm before quoting corpus size).
- Ground truth: **none yet**. Zero reviewed classifications exist, so the starter
  dataset (`classifier-evaluation.json`, 8 cases) is all placeholders with
  `expected_* = null` and `needs_pm_review = true`. The script scores 0 cases and
  lists all 8 as pending. This is intentional: labels must come from historical
  approved classifications or PM/domain-expert review — never from classifier output.

## Review invariants (enforced by review-eval.js)

- `REVIEWED` means a decision was made. `[c]orrect` requires complexity code +
  status + failure category (use `unknown` when the cause cannot be determined);
  blank answers re-prompt, `[s]kip` leaves the case `UNREVIEWED`.
- `UNREVIEWED` as a failure category is invalid on reviewed rows. If it ever
  appears there, `scripts/repair-unreviewed-categories.js` reopens those cases
  (backup first, expectations and predictions preserved) for re-resolution.
- `[a]pprove` copies the prediction to ground truth; `[c]orrect` never does.

## Adding real cases (target: 50–100)

1. Copy a placeholder entry, fill `title` (+`description`, `quantity`,
   `machine_model_id`, `machine_model_version_id` as applicable).
2. Fill `expected_complexity_code` (L0–L5) and optionally `expected_status`
   from an approved historical verdict or expert judgment. Set `needs_pm_review: false`
   (or delete the flag), set `source` to `historical` or `pm-review`.
3. Re-run. New cases join accuracy, distribution, latency, and failure analysis
   automatically. Retire/adjust placeholders as the set grows.

## Reading the report

- **Correct** = predicted level (and status, when expected) matches.
- **Needs Review / No Decision** = classifier routed to `CODER_REVIEW` — not counted
  wrong; these are the ambiguity backlog, the most valuable list for KB work.
- **Failure category** values ending in `(auto-suggested)` are deterministic
  heuristics, not verdicts — a developer/PM confirms each one. Truly ambiguous
  cases print `UNREVIEWED`. Use them to distinguish: (A) bad/missing KB data,
  (B) normalization/tokenization, (C) thresholds, (D) genuine semantic mismatch,
  (E) ambiguous business classification. A mismatch is not automatically (D).
- **21-probe regression** runs the existing gate unmodified and prints PASS/FAIL.
- Latency covers per-item scoring; KB load/prep is reported via cache counters.
  This is a correctness-and-baseline tool, not an optimizer.
