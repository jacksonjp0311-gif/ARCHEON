# Design fidelity

v0.5.1 adds an engineering studio lighting rig and semantic theme tokens (`--action-primary` gold for human actions, `--agent` lavender for AI). Physical CAD materials stay realistic; gold/lavender are overlays, not coatings.

Fidelity is a **budget**, not a quality claim.

## Levels

**CONCEPT** — masses and interfaces. Hide fastener instances and covers in the viewport if requested; DesignIR may still hold them.

**ENGINEERING** (default) — real decomposition: housing, shaft, bearing pair, retainers, motor/gearbox envelopes, mounts, service cover, cable passage, fastener groups.

**DETAILED** — ENGINEERING plus washers/nuts, extra retention, encoder body. Raised through DTP (`design.fidelity` parameter). Not dumped automatically.

## Detail budget

| Tier | Examples | Render |
|---|---|---|
| primary | housing, shaft, bearings, motor envelope | high |
| instance | GENERIC bolts | instanced / reused mesh |
| hidden | internal trivial grommet when not inspecting | lower |

Detail follows engineering importance. Standard screws are not unique sculptures.

## CAD kernel coverage (honest)

Implemented as geometry by the primitive STEP/STL kernel:

- box, cylinder (EXACT)
- extrude analog → box (EXACT)
- revolve analog → cylinder (EXACT)
- tube / hollow cylinder (EXACT) — spacer, bearing bore analog
- hole / bearing_seat / cable_passage on a cylinder → tube (EXACT)
- hole on a box → STEP envelope EXACT, STL PREVIEW
- shaft_step → STEP journal EXACT, STL PREVIEW
- fastener cap head → STL PREVIEW, STEP cylinder EXACT

Implemented as OCCT solids **only if build123d imports**:

- Boolean cut (hole, pocket, bearing_seat)
- Boolean union (shaft_step)
- fillet, chamfer

Stored on DesignIR, **not** authored by the primitive kernel:

- slot, boss, rib, shell, thread / thread_reference, mount_pattern, flange, keyway, sketch, datum

## Inspection

- `open the shoulder` — ghost housing/cover, section plane, stack explode along JointAxis
- `show me the internal stack` — coaxial explode (Motor → Gearbox → Shaft → Bearings → Retainer → Arm interface)
- `show the load-carrying interfaces` — neighborhood of the load path, not FEA
