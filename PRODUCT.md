# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

PMs plan work orders and run classification/estimation; CODERs work the review queue and execute production tasks. Both roles use the tool daily, on office desktops. ADMIN configures (users, machine models, knowledge base, complexity levels) — secondary audience.

## Product Purpose

Internal firmware custom-item classification and estimation system (Express + PostgreSQL backend, Vite + React SPA). PMs create work orders, the system classifies line items against a knowledge base and estimates verification effort; CODERs review uncertain items and complete production. Success means fewer items stuck in review and trustworthy estimates.

## Operating Context

Workflows run create → analyze → coder review → finalize → production, gated by role (PM / CODER / ADMIN). API envelope is always `{ success, message, data }`. Every consequential action leaves an audit-trail row. Notifications are fire-and-forget. Demo/seed accounts exist for all roles.

## Capabilities and Constraints

- Role-based pages and dashboards per audience; review queue for uncertain items; audit log; notifications.
- Technical: builds stay self-contained and offline-safe (no webfont or CDN dependencies); modern browsers (backdrop-filter and modern CSS are safe); dark and light themes both ship behind a working toggle.
- Terminology: WO (work order), KB (knowledge base), complexity L0–L5, CODER_REVIEW.

## Brand Commitments

Name "Firmware Custom" with the FC brand mark on Login. User-bound restyle brief, recorded without expansion: flagship surfaces are Login plus the three dashboards; palette direction is black/blue with restrained white; the light theme is mirrored, not dropped. Exact tokens and surfaces belong to the design record, not here.

## Evidence on Hand

Live runnable app (backend on :5000, Vite dev server on :5173, `/api` proxied). Seed demo accounts for PM, CODER, and ADMIN roles. Existing `frontend/DESIGN.md` records the incumbent quiet-minimal direction (slated for replacement per the approved restyle, not as product truth).

## Product Principles

- Trust over automation flash: uncertain items go to a human rather than auto-claim.
- Role-appropriate density: planners and reviewers each get their own surface.
- Auditability: consequential actions leave a trail.
- Lean delivery: offline-safe builds, no dependency weight without a reason.

## Accessibility & Inclusion

AA contrast minimum everywhere; labelled inputs with autocomplete and `role="alert"` errors on auth forms; new motion gated behind `prefers-reduced-motion`.
