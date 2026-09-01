# ARCHEON Arm (example project)

Six-axis benchtop arm. v0.5 ENGINEERING shoulder is an interface-first bearing-supported pitch joint.

| Claim | Truth class |
|---|---|
| Reach 800 mm | DERIVED from link lengths |
| Payload 3 kg | REQUIREMENT, UNVERIFIED |
| Cost ≤ $2000 | REQUIREMENT, catalog not connected |
| GENERIC_6204 | PARAMETRIC_REFERENCE (20/47/14 mm). Not a manufacturer PN |
| Journal / seat | DERIVED from bearing ID/OD. Fit class ASSUMED — not ISO 286 |
| Motor / gearbox | GENERIC envelopes. Internals not modeled |
| Fasteners | Cosmetic THREAD_REFERENCE. Not helix BREP |
| STEP | Exact for box/cylinder/tube. Housing bore and shaft steps: envelope STEP + PREVIEW STL unless build123d is installed |

Do not treat this as a qualified robot.
