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

## Phase 1.4.2 / v0.5.2 — Spatial overlay discipline — this tree

- Independent overlay flags (trails ≠ exploded mode)
- LINES toggles explode trails only
- Interface lines are explicit + 1-hop
- Ports are HOST-LOCAL
- Inspector closes on deselect unless pinned
- Aspect-aware AABB camera fit

## Phase 1.4.1 / v0.5.1 — Engineering visual fidelity — shipped

- Semantic theme tokens (gold = human, lavender = agent)
- Studio lighting (key / fill / rim) + warehouse environment, fading grid
- Distinct physical materials; selection is gold outline, not a gold material
- Bearings/retainers as exact tubes; motor/gearbox flange PREVIEW
- UTF-8 encoding repair in workstation copy

## Phase 1.4 / v0.5 — Generative engineering fidelity — shipped

- FeatureKind expanded (hole, bearing_seat, shaft_step, fillet, chamfer, pattern, …)
- Parametric generators + GENERIC component library (no fake manufacturer PNs)
- FastenerGroup + labeled fits (ASSUMED / DERIVED / STANDARD_REFERENCE)
- AssemblyPlan is interface-first; CAD worker authors STEP/STL from features
- ARCHEON Arm shoulder rebuilt as an ENGINEERING assembly
- Fidelity CONCEPT / ENGINEERING / DETAILED; detail budget
- Cutaway / stack explode / ghost housing inspection
- Honest CAD coverage: do not claim OCCT fillets unless build123d is installed

## Phase 1.3.1 / v0.4.1 — Spatial stability — shipped

- Recursive assembly-accumulated explosion (no 12% residual drift)
- EXPLODE resolves leaf → containing assembly
- Camera fit follows spatial intent; slider no longer steals orbit
- Ports, explode lines, and bounds use final render transforms

## Phase 1.3 / v0.4 — Adaptive Human Interface — shipped

- Compact Engineering Rail (PROJECT / FIND / SYSTEM / ANALYZE / HISTORY)
- Searchable Project Browser (filters, not destinations)
- Collapsible Workbench drawer
- Human modes DESIGN / ASSEMBLE / ANALYZE / REVIEW
- SYSTEM HEALTH HUD behind ✓ HEALTHY
- HudManager: one primary + two utility + special Agent HUD
- Right-click context menu + Space radial menu
- Collapsed Item Tracker when empty
- Breadcrumbs and progressive inspector

## Phase 1.2 / v0.3 — Live Design — shipped

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

## Phase 2 — Parametric BREP authoring — partial

- Feature history rebuild on OpenCascade: partial (build123d adapter when installed)
- Sketch constraints: not started
- Fillet / chamfer / pattern as kernel ops: OCCT path only; primitive kernel records SEMANTIC / PREVIEW
- Round-trip DesignIR ↔ OCCT: not started

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
