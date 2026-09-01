# DesignIR schema (Phase 1)

Canonical on-disk form is a **directory of JSON files**, not a database.

```text
projects/<name>/
  project.json
  requirements.json
  assemblies.json
  parts.json
  interfaces.json
  features.json
  materials.json
  assembly_sequence.json
  parameters.json
  transactions.json
  provenance.json
  fasteners.json
  library.json
  assembly_plan.json
  fits.json
```

Identity is dotted lowercase semantic ids (`part.shoulder.housing`). Provenance classes are SCREAMING_SNAKE. Units: store engineering units plus optional `si`.

Migration to an event log is possible because every committed transaction is already a typed operation list with hashes.
