# ARCHEON Live Design

Version 0.3.0 — Human-centered agentic engineering.

> Think it. See it. Engineer it.

Canonical DesignIR is never mutated by a Live Design session. COMMIT still requires DTP and operator authority.

## Three clocks

| Clock | Owns | Must not |
|---|---|---|
| Render | camera, explosion, ghosting, selection, overlays, proposal ghosts | wait for AI or CAD |
| Engineering | DesignIR dry-run, CAD jobs, graph validation | block the viewport |
| Agent | intent → tools → proposals → explanations | animate frames or write DesignIR |

## LiveDesignSession

Temporary. Isolated. Statuses: `PLANNING → EDITING → REGENERATING → VALIDATING → READY` and `BLOCKED | APPROVED | REJECTED | CANCELLED`.

`APPROVED` on the session is **not** a commit. Only `POST /api/transactions/commit` with operator authority replaces canonical state.

## CAD jobs

`CadJob` statuses: `QUEUED → RUNNING → COMPLETE | FAILED | CANCELLED`.

Progress is `null` unless a worker reports it. This build does **not** invent percentages. The Python kernel runs as one shot, so you will not see `TESSELLATING` unless a future worker actually tessellates as a separate step.

`POST /api/cad/regenerate` returns a job id immediately. Geometry hot-swap: same semantic part id, `geomRev` query on `/api/media/...` so the mesh reloads without resetting camera, selection, explosion, or tracker.

## Variants

`try three versions` dry-runs `upper_arm.length` +25 / +50 / +75 mm (or `wrist.length` if the command names the wrist). These are **PREVIEW envelopes**, not independent CAD kernels.

`give me B` focuses variant B. `best one` is a **heuristic** (derived reach vs 800 mm), not an optimizer.

## Events

SSE `GET /api/events/stream`. Events describe state. They do not grant authority.

`CAD_JOB_COMPLETE` does not commit a proposal.
