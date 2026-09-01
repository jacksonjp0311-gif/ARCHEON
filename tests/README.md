# Cross-cutting tests

Crate unit tests live next to the code:

```powershell
cargo test --workspace
python -m pytest workers\cad-occt\tests
cd apps\workstation; npm test
```

This folder is reserved for future end-to-end scenarios (API + CAD worker + DTP) that do not belong to a single crate.
