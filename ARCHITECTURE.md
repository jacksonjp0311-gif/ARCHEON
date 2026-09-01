# ARCHEON architecture

Version 0.1.0 — Phase 1 foundation.

> Geometry is only one projection of an engineered system.

DesignIR is the source of truth. The renderer, the language model, and the CAD kernel are projections and adapters.

---

## Invariants

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
render loop ≠ DesignIR canonical state ≠ CAD regeneration ≠ simulation
```

### 8. Replaceable CAD kernel

All exact geometry goes through `CadKernelAdapter`. Phase 1 implements a primitive STEP/STL kernel and an optional build123d adapter.

### 9. Replaceable model provider

`AiProvider` is an adapter. `MockProvider` always works. `OpenAICompatibleProvider` reads env vars. No provider is hardcoded in the UI.

### 10. Provenance survives revisions

Every committed transaction produces a revision. Provenance records who/why/which requirement/which agent/which evidence/whether the user approved.

---

## Runtime planes

```text
┌─────────────────────────────────────────────┐
│ Workstation (React / R3F)                   │
│  spatial projection · HUD · agent console   │
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

---

## Entity model

Stable semantic types: `PROJECT`, `SYSTEM`, `ASSEMBLY`, `PART`, `FEATURE`, `DATUM`, `PORT`, `INTERFACE`, `MATE`, `CONSTRAINT`, `FUNCTION`, `FLOW`, `LOAD`, `MATERIAL`, `REQUIREMENT`, `ANALYSIS`, `EVIDENCE`, `DECISION`, `REVISION`, `TRANSACTION`, `AGENT`, `TOOL`, `VALIDATION`.

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

Dry-run applies operations to a cloned document. Only `COMMITTED` replaces canonical state and appends a revision.

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

Phase 1 feature support: `box`, `cylinder`, `sketch_rectangle`, `sketch_circle`, `extrude`, `hole` (cylindrical cut on box — primitive kernel), `datum_axis`, basic transform.

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
