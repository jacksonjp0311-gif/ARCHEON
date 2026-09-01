# Contributing to ARCHEON

ARCHEON is an agent-native spatial engineering OS. The engineering graph is primary. Geometry is one executable projection of that graph.

## Invariants (do not break)

1. No rendered engineering object exists without semantic identity.
2. Agents cannot directly mutate canonical engineering state.
3. Canonical changes occur only through Design Transactions (DTP).
4. Every interface connects valid semantic endpoints.
5. Visual transformations never destroy engineering identity.
6. Memory cannot grant mutation authority.
7. Simulation state remains distinct from render state.
8. CAD kernels are replaceable adapters.
9. Model providers are replaceable adapters.
10. Provenance survives revisions.

## Authority

```text
READ → PROPOSE → VALIDATE → COMMIT → ADMIN
```

Humans retain `COMMIT` by default. Agents may `READ`, `PROPOSE`, and request `VALIDATE`. They may not execute shell, modify source, or write canonical JSON except via the transaction engine.

## Honesty

If a capability is mock, heuristic, placeholder, or unimplemented, say so in types, UI, and docs. Do not invent prices, material allowables, FEA results, or collision-free claims.

## Layout

- Rust crates under `crates/` own DesignIR, DTP, validation, agents, and the API.
- The CAD worker under `workers/cad-occt` owns exact geometry.
- The workstation under `apps/workstation` owns visualization only.
- Canonical example project: `projects/archeon-arm/`.

## Tests

```powershell
cargo test --workspace
python -m pytest workers/cad-occt/tests
cd apps/workstation; npm test
```

## Pull requests

Keep changes scoped. Do not couple Three.js meshes to DesignIR identity. Do not call the CAD kernel from React.
