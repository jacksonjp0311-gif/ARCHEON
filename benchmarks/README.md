# ARCHEON benchmarks

This harness exists so future measurements have a place to land. **Phase 1 ships the schema, not scores.**

Do not invent benchmark numbers. A dimension is either a real measurement recorded under `results/` or it is omitted.

## Dimensions

| Dimension | Meaning | Phase 1 |
|---|---|---|
| requirement satisfaction | fraction of requirements with evaluable evidence | not scored |
| geometry validity | CAD kernel produced closed solid | measured only when worker runs |
| interface correctness | every interface endpoint resolves | covered by unit tests, not a score |
| constraint correctness | under/overconstraint detection | heuristic only |
| assembly completeness | every part has a parent except root | unit tests |
| agent transaction validity | unauthorized ops rejected | unit tests |
| regeneration reliability | CAD regen success rate | not scored |
| collision count | kernel interference hits | null unless kernel checked |
| repair success rate | critic→repair loop | not implemented |
| transaction rollback reliability | rollback restores hash | unit tests |
| design reproducibility | same DesignIR → same hash | unit tests |

## Recording a result

Write a JSON object matching `schema.json` into `results/`. Leave unmeasured fields `null`.
