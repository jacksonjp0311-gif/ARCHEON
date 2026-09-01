# Generative fidelity benchmarks

These prompts measure **engineering coherence**, not a beauty score.

Do not invent scores. Record counts and pass/fail from the live tools.

## Prompts

| Id | Prompt | In-tree fixture |
|---|---|---|
| A | Design a bearing-supported rotating shaft. | `asm.shoulder` shaft + GENERIC_6204 pair |
| B | Design a motor-driven shoulder joint. | `plan.shoulder` |
| C | Design an electronics enclosure with removable lid. | `ServiceCoverGenerator` + unit test |
| D | Design a structural bracket with four mounting bolts. | `BracketGenerator` / encoder mount |

## Metrics (raw)

- semantic completeness (required roles present)
- part count
- interface completeness (ports with interfaces / total ports)
- BREP success rate (`generated/manifest.json` exact flags)
- CAD regeneration success (`ok`)
- validation errors / warnings
- determinism (two regenerations, same hashes)
- visual component coverage (parts with STL preview)

## Runner

```text
python benchmarks/generative_fidelity/run.py
```

Writes `benchmarks/results/v0.5.json`. Values are measured, not guessed.
