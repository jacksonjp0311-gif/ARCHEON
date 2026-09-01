# Governance

ARCHEON treats engineering change as a governed protocol, not a chat side effect.

## Least authority

Agents must not:

- execute arbitrary shell commands
- modify source code or random files
- access arbitrary user files
- mutate canonical state outside transactions

Tools operate only against explicit APIs declared in the tool registry.

## Authority classes

```text
READ       inspect DesignIR and spatial view
PROPOSE    create a transaction
VALIDATE   run validators / CAD regeneration
COMMIT     approve, commit, reject, rollback
ADMIN      reload project, select kernel
```

Human retains `COMMIT` by default.

## Honesty classes

| Class | Meaning |
|---|---|
| KNOWN | sourced fact (e.g. published Al density) |
| DERIVED | computed from DesignIR (e.g. reach = Σ link lengths) |
| ASSUMED | explicit engineering assumption |
| SIMULATED | produced by a named model |
| VALIDATED | compared to evidence |
| UNVERIFIED | required but not evidenced |

Never promote ASSUMED to VALIDATED in the UI.
