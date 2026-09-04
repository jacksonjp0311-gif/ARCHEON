# Executable mechanical intelligence (v0.6.0)

ARCHEON generates **mechanically coherent assemblies**, not decorative sci-fi solids.

```text
requirements → system decomposition → assemblies → interfaces
→ mechanisms → parametric parts → exact BREP → tessellated preview
```

Engineering coherence first. Visual detail second. A 12-part bearing-supported joint beats 80 meaningless fillets.

## Geometry truth classes

| Label | Meaning |
|---|---|
| `EXACT_BREP` | Imported authoritative STEP/BREP artifact. |
| `EXACT_BREP_TESSELLATION` | Display mesh derived from exact BREP. |
| `SOURCE_MESH` | Imported STL/glTF/OBJ; source geometry but not BREP. |
| `GENERATED_EXACT` | Kernel-authored exact solid for all reported applied features. |
| `GENERATED_PREVIEW` | Incomplete/tessellated generated projection. |
| `SEMANTIC_ONLY` | Feature exists in DesignIR but no geometry is authored. |
| `PRIMITIVE_FALLBACK` | DesignIR envelope used because richer geometry is unavailable. |

Three.js boxes/cylinders remain a **viewport fallback envelope** when no STL is attached. They are not the generated design path.

## Pipeline (no DTP bypass)

ARCHITECT → ASSEMBLY DESIGNER → COMPONENTS → CAD DESIGNER → CONSTRAINT ENGINEER → DFM REVIEWER → CRITIC → VISUAL / SPATIAL DIRECTOR

Agents propose. Humans COMMIT.

## Fidelity

| Level | What you get |
|---|---|
| CONCEPT | Major masses and interfaces |
| ENGINEERING (default) | Part decomposition, holes, bearings, shafts, mounts, fastener groups |
| DETAILED | Washers/nuts, extra retention, encoder body — proposed, not auto-dumped |

## Interface first

`MotorOutputPort` and `GearboxInputPort` exist before the solids hope to mate. Fits are labeled `ASSUMED | STANDARD_REFERENCE | USER_SPECIFIED | DERIVED | VALIDATED`. ARCHEON never silently invents an H7/g6.

## Mechanism benchmark

The shoulder and elbow are resolved from DesignIR names, semantic roles, membership, joints, interfaces, and load paths. The elbow intentionally has no declared bearing support; the runtime reports that fact as `UNVERIFIED` rather than borrowing shoulder knowledge.
