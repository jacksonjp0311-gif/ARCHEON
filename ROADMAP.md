# ARCHEON roadmap

Status language: **shipped**, **partial**, **not started**. Nothing here is a claim that a robot or CAD kernel is production-qualified.

## Phase 0 — Architecture foundation — shipped in this tree

- DesignIR types and canonical JSON
- Provenance model
- DTP status machine
- Validation codes
- Agent cards and authority
- Adapter boundaries (CAD, AI, memory)

## Phase 1 — Semantic assembly + spatial workstation — shipped

## Phase 1.2 / v0.3 — Live Design — this tree

- Three clocks (render / engineering / agent)
- Scene command bus (deterministic, no agent frame animation)
- LiveDesignSession isolated from canonical DesignIR
- Async CAD jobs + geometry hot-swap nonce
- Variant A/B/C parameter previews (envelope, not independent kernels)
- Ctrl+K command palette, context ribbon, object HUD
- Camera history + spatial undo (view undo ≠ design rollback)
- SSE engineering events
- Human-readable agent cards and structured steps (not chain-of-thought)

## Phase 1.1 / v0.2 — Spatial engineering workstation — shipped

- Floating morphing Agent HUD (not a permanent right rail)
- Selection nullability + Item Tracker + CAD Inspector
- Explosion v2 with spread presets and hierarchical SYSTEM explode
- Auto camera framing, explode lines, PBR/shadows
- Composed SpatialView / RenderStyle / Overlay
- Contextual agent commands (`give me the shoulder`, `break it apart`, …)

- ARCHEON Arm example project
- Workstation shell (tree, viewport, agent console, bottom workspace)
- Explosion engine (sequence / radial / axial)
- Local deterministic commands
- Proposal / approve / reject
- Primitive STEP/STL kernel
- Optional build123d adapter (used only if installed)

## Phase 2 — Parametric BREP authoring — not started

- Feature history rebuild on OpenCascade
- Sketch constraints
- Fillet / chamfer / pattern as kernel ops
- Round-trip DesignIR ↔ OCCT

## Phase 3 — Agent transaction system — partial

- Local planner and critic notes: shipped
- LLM-backed multi-agent debate: adapter only
- Alternative design branches: not started

## Phase 4 — Assembly constraints + mates — partial

- Mate records and port endpoints: shipped
- Geometric constraint solver: not started
- Drag-to-mate: not started

## Phase 5 — Engineering analysis — not started

- Real kinematics (DH / screw theory)
- FEA adapter (explicit external solver only)
- Motion collision along trajectory

## Phase 6 — Persistent Cortex memory — not started

- `CortexMemoryProvider` is a stub
- Do not vendor Cortex into this repository

## Phase 7 — Component / vendor intelligence — not started

- Catalog adapter exists as interface
- No purchasing APIs, no invented prices

## Phase 8 — Multidisciplinary domain packs — not started

- `domains/mechanical` and `domains/robotics` contain notes only

## Phase 9 — Collaborative engineering — not started

## Phase 10 — Production-grade autonomous workflows — not started
