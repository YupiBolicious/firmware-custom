# DESIGN.md — Firmware Custom frontend (scope: login first, tokens app-wide)

## 0. Direction
Quiet dark-minimal internal tool. Restraint is correct: no glass, no gradients-for-show, no motion beyond feedback. One accent (`--accent` blue), one gray family (neutral-cool), system font stack (no font deps — offline builds stay self-contained).

## 1. Tokens (extracted from `src/index.css`, additions marked +)
- bg `#121212` / panel `#1e1e1e` / input `#2a2a2a` / border `#3a3a3a`
- text `#e0e0e0` / muted `#9a9a9a`
- accent `#4c9aff` / accent-hover `#3a7fd6` / success `#4caf50` / warning `#ff9800` / danger `#f44336` / info `#2196f3`
- + `--ring: rgba(76,154,255,.28)` (focus rings, login scope)
- + `--shadow-card: 0 24px 64px rgba(0,0,0,.5)` (login card only)
- Radius rule: containers 12 / fields + buttons 8 (login scope; legacy 4/6 elsewhere untouched)
- Type: system stack; login title 20px/650, body 14, micro 12-13 muted.

## 2. Login anatomy
Centered card (max 400px) → brand mark → left-aligned title block → fields (label above, error below) → full-width CTA → demo hint → quiet footer. States: rest / focus (accent border + ring) / loading (disabled + "Signing in…") / error (`role="alert"`).

## 3. Motion (login)
Entry: card fade + 8px rise, 240ms ease-out. Interactions: 160ms border/background transitions; button hover lift 1px, press `scale(.99)`. All gated behind `prefers-reduced-motion`.

## 4. Accessibility constraints
- Every input has `<label htmlFor>` + `autocomplete`; error uses `role="alert"`.
- Focus always visible (ring, never `outline:none` alone).
- Login CTA uses dark text `#06121f` on accent (passes AA; white-on-accent does not).
- Contrast AA minimum everywhere; placeholders stay ≥ 4.5:1 against input bg.

## 5. Accepted debt
- System font stack kept (no webfont dep). App-wide white-on-accent buttons below AA — out of login scope, flagged not fixed.
- React dev-tooling gate skipped: static auth screen, no render-perf dimension; QA via CDP screenshot harness instead.
