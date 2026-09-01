# Component generators

Generators emit **DesignIR fragments** (features, ports, envelope, provenance). The CAD worker turns those fragments into STEP/STL.

They do not paint mechanical-looking noise.

| Generator | Inputs | Output |
|---|---|---|
| BearingHousingGenerator | bearing_od, width, wall, span | tube envelope + bearing_seat + ports |
| ShaftGenerator | journal_d, length, optional step | cylinder + shaft_step |
| MotorMountGenerator | bolt_circle, thickness, motor_od | plate + mount_pattern |
| GearboxHousingGenerator | od, length | envelope cylinder + input/output ports |
| FlangeGenerator | od, id, thickness, bolt_count | tube + flange feature (SEMANTIC in primitive kernel) |
| BracketGenerator | sx, sy, sz, bolt_count | box + mount_pattern |
| SpacerGenerator | inner_d, outer_d, width | tube |
| FastenerPatternGenerator | diameter, count, bolt_circle | pattern + THREAD_REFERENCE note |
| BearingSeatGenerator | bearing_od, width | seat feature + port |
| StructuralLinkGenerator | length, section | extrude analog |
| ServiceCoverGenerator | sx, sy, thickness | cover + service_access port |

Rust: `crates/archeon-design-ir/src/generators.rs`  
Python: `workers/cad-occt/archeon_cad/generators.py`

## Component library

`GENERIC / PARAMETRIC` until a real catalog is connected.

Example:

```text
GENERIC_6204_BEARING
  inner diameter  20 mm
  outer diameter  47 mm
  width           14 mm
  truth           PARAMETRIC_REFERENCE
```

This is an ISO 15 envelope analog. It is **not** an SKF or NSK part number.

Classes: bearings, bolts, nuts, washers, shafts, motors, gearboxes, couplings, linear bearings, bushings.

## Fastener groups

`FastenerGroup` records bolt_type, diameter, count, hole_type, washer, nut, torque_reference.

The kernel:

1. records host holes as `mount_pattern` / `hole` features
2. instances visual/semantic fastener parts

Threads are `THREAD_REFERENCE` / cosmetic unless an operator explicitly asks for helix BREP (not implemented).
