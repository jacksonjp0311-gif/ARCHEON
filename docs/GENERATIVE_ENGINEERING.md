# Generative engineering fidelity (v0.5)

ARCHEON generates **mechanically coherent assemblies**, not decorative sci-fi solids.

```text
requirements → system decomposition → assemblies → interfaces
→ mechanisms → parametric parts → exact BREP → tessellated preview
```

Engineering coherence first. Visual detail second. A 12-part bearing-supported joint beats 80 meaningless fillets.

## Geometry truth labels

| Label | Meaning |
|---|---|
| **EXACT** | Kernel authored a real B-rep (STEP). Box, cylinder, tube always. OCCT solids when build123d is installed. |
| **PARAMETRIC** | Dimensions live on DesignIR features/parameters and drive regeneration. |
| **PREVIEW** | STL tessellation of the solid, or a preview of a feature the primitive kernel cannot Boolean (box hole, shaft steps, fastener cap head). |
| **ASSUMED** | A number used to build geometry that is not a measured or standard-class value (wall 8 mm, cover gap 1 mm). |
| **VISUAL ONLY** | Cosmetic representation (THREAD_REFERENCE, bolt head preview). Not helix BREP. |

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

## Shoulder benchmark

`plan.shoulder` is the in-tree proof: base, housing, motor envelope, gearbox envelope, shaft, GENERIC_6204 pair, retainers, spacer, upper-arm mount, fastener groups, service cover, cable passage, joint axis.
