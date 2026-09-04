# ARCHEON architecture

Version 0.6.0 — Executable Mechanical Intelligence.

> Geometry is only one projection of an engineered system.

DesignIR is the source of truth. The renderer, the language model, and the CAD kernel are projections and adapters.

---

## Invariants

### 0. Human interface

The machine is the primary navigation surface.

The default interface is driven by human intent and selected engineering context.

Complexity must be available without being permanently visible.

### 1. Semantic identity

No rendered engineering object exists without a stable semantic id (`part.shoulder.housing`, not `face_317`).

### 2. No agent mutation

AI agents cannot directly mutate canonical engineering state.

### 3. Design transactions

Canonical changes occur only through the Design Transaction Protocol (DTP).

### 4. Valid interfaces

Every interface connects valid semantic endpoints (ports on parts or assemblies).

### 5. Visual identity survival

Explosion, isolate, x-ray, cutaway, and proposal ghosting change transforms only. They never destroy or rewrite entity identity.

### 6. Memory is not authority

Memory provides evidence and context. It cannot grant mutation rights or bypass DTP.

### 7. Distinct clocks / states

```text
render clock  ≠  engineering clock  ≠  agent clock
render loop ≠ DesignIR canonical state ≠ CAD regeneration ≠ simulation
```

Live Design sessions, CAD jobs, and variants live on the engineering clock. They never freeze the viewport. Events (`GET /api/events/stream`) describe state; they do not grant COMMIT.

### 8. Replaceable CAD kernel

All exact geometry goes through `CadKernelAdapter`. v0.6 consumes explicit `FeatureFrame` origin/RPY/axis in both primitive preview and build123d/OCCT paths. Every part report includes geometry class, applied/unsupported/failed features, bbox, volume, optional density-derived mass, hash, and revision. Three.js primitives are not the generated design path.

See `docs/GENERATIVE_ENGINEERING.md`, `docs/COMPONENT_GENERATORS.md`, `docs/DESIGN_FIDELITY.md`.

### 9. Replaceable model provider

`AiProvider` is an adapter. `MockProvider` always works. `OpenAICompatibleProvider` reads env vars. No provider is hardcoded in the UI.

### 10. Provenance survives revisions

Every committed transaction produces a revision. Provenance records who/why/which requirement/which agent/which evidence/whether the user approved.

---

## Runtime planes

```text
┌─────────────────────────────────────────────┐
│ Workstation (React / R3F)                   │
│  navigator · spatial view · inspector       │
│  floating Agent HUD (not a permanent rail)  │
└────────────────────┬────────────────────────┘
                     │ HTTP  /api
┌────────────────────▼────────────────────────┐
│ archeon-api  (Rust)                         │
│  project · commands · DTP · orchestration   │
└──┬──────────┬──────────┬──────────┬─────────┘
   │          │          │          │
   ▼          ▼          ▼          ▼
DesignIR   Agents     Validation   CAD worker
document   (bounded)  (graph)      (Python)
   │                                  │
   └──────── canonical JSON ──────────┘
             projects/<name>/
```

Physics/CAD libraries never import UI types. The UI never writes DesignIR files.

### v0.2 workstation surfaces

```text
LEFT   Engineering Navigator (system / assembly / parts / features / joints / interfaces / analysis / requirements)
CENTER Spatial viewport (projection only)
RIGHT  Item Tracker + CAD Inspector
BOTTOM Feature / BOM / Mates / Analysis / Transactions / Validation / Timeline
FLOAT  ARCHEON Agent HUD (morphing instrument — session UI state only)
```

Selection is nullable (`selectedId: string | null`) plus `hoveredId`, `trackedIds`, `recentIds`. Tracker is a watch list, not selection history. HUD geometry lives in `sessionStorage` key `archeon.agentHud.v1` and is never written to DesignIR.

Explosion is a graph projection: `progress ∈ [0,1]` × spread preset (`COMPACT` … `EXTREME`) × hierarchy. Render transform = canonical origin + explosion + focus pull + proposal ghost. Identity is unchanged.

---

## Entity model

Stable semantic types include `PROJECT`, `SYSTEM`, `ASSEMBLY`, `PART`, `JOINT`, `FEATURE`, `DATUM`, `PORT`, `INTERFACE`, `MATE`, `CONSTRAINT`, `FUNCTION`, `FLOW`, `LOAD`, `MATERIAL`, `REQUIREMENT`, `ANALYSIS`, `EVIDENCE`, `DECISION`, `REVISION`, `TRANSACTION`, `AGENT`, `TOOL`, and `VALIDATION`.

`Joint` is first-class and initially supports `FIXED | REVOLUTE | PRISMATIC`, explicit parent/child frames, axis, limits, drive metadata, rotating group, load path, interfaces, and provenance. This is kinematic semantics, not a dynamics solver.

`schema/design-ir.schema.json` is the canonical transport manifest. `scripts/generate_design_types.mjs` generates the frontend definitions and `npm test`/`npm run build` fail when the generated file drifts.

Each carries:

```text
id, name, semantic_role, provenance
```

Provenance classes: `SOURCE | DERIVED | GENERATED | SIMULATED | VALIDATED | MEASURED | ASSUMED | UNVERIFIED | USER_LOCKED`.

---

## DTP lifecycle

```text
PROPOSED
   │
   ▼
VALIDATING ──► INVALID ──► REJECTED
   │
   ▼
 VALID ──► APPROVED ──► COMMITTED ──► ROLLED_BACK
              │
              └── REJECTED
```

Dry-run applies every operation to a cloned document, validates the graph, calculates a semantic/geometry-affected diff, and rejects unsupported behavior with `UNSUPPORTED_OPERATION`. Only a human-authorized `COMMITTED` transaction persists split DesignIR files and appends a revision.

---

## Authority

| Class | May |
|---|---|
| READ | inspect graphs, run spatial commands |
| PROPOSE | create transactions |
| VALIDATE | run validators / CAD regen |
| COMMIT | approve, commit, reject, rollback |
| ADMIN | reload project, kernel select |

Default agent authority is `READ + PROPOSE`. Spatial Director is `READ` only for view commands (those do not mutate DesignIR). Human/operator is `COMMIT`.

---

## CAD boundary

```text
DesignIR feature graph
        │
        ▼
 CadKernelAdapter.regenerate(document)
        │
        ├── STEP  (exact, if kernel supports the feature)
        ├── STL   (tessellation for preview, not source of truth)
        └── reports: bbox, mass properties (ASSUMED density)
```

Geometry truth is one of `EXACT_BREP`, `EXACT_BREP_TESSELLATION`, `SOURCE_MESH`, `GENERATED_EXACT`, `GENERATED_PREVIEW`, `SEMANTIC_ONLY`, or `PRIMITIVE_FALLBACK`. Imported STL/glTF/OBJ is never called exact CAD.

Validation contracts currently cover feature frames, joints, interfaces, bearing-support semantics, fastener patterns, and assembly closure. Contract results preserve `VALIDATED | WARNING | ASSUMED | UNVERIFIED | UNSUPPORTED`; graph success cannot promote an assumption to a fact.

Interference check: AABB heuristic is labeled `HEURISTIC`. Exact Boolean interference is performed only when the OCCT/build123d adapter is active.

---

## Memory boundary

```text
MemoryProvider.remember(kind, text, provenance)
MemoryProvider.query(text) -> evidence[]
```

`CortexMemoryProvider` exists as a compile-time/documented stub and returns `not_implemented`. Do not embed Cortex.

---

## Observability

Structured logs include `transaction_id`, `revision_id`, `agent_id`, `event` (`agent.run`, `transaction.*`, `validation`, `cad.regen`, `api.request`, `error`).
