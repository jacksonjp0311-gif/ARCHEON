"""GENERIC / PARAMETRIC component library.

No manufacturer catalog data. Designations such as GENERIC_6204_BEARING
are parametric references (ISO 15 6204 envelope analog), not SKF/NSK PNs.
"""
from __future__ import annotations

GENERIC = [
    {
        "id": "lib.bearing.6204",
        "class": "bearing",
        "designation": "GENERIC_6204_BEARING",
        "params": {
            "inner_diameter_m": 0.020,
            "outer_diameter_m": 0.047,
            "width_m": 0.014,
        },
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "ISO 15 6204 envelope analog. Not a purchased manufacturer PN.",
    },
    {
        "id": "lib.bearing.6205",
        "class": "bearing",
        "designation": "GENERIC_6205_BEARING",
        "params": {
            "inner_diameter_m": 0.025,
            "outer_diameter_m": 0.052,
            "width_m": 0.015,
        },
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "ISO 15 6205 envelope analog. Not a purchased PN.",
    },
    {
        "id": "lib.bolt.m4_shcs",
        "class": "bolt",
        "designation": "GENERIC_SHCS_M4",
        "params": {"diameter_m": 0.004, "head_d_m": 0.007, "length_m": 0.012},
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "ISO 4762 analog. Thread is THREAD_REFERENCE.",
    },
    {
        "id": "lib.bolt.m5_shcs",
        "class": "bolt",
        "designation": "GENERIC_SHCS_M5",
        "params": {"diameter_m": 0.005, "head_d_m": 0.0085, "length_m": 0.016},
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "ISO 4762 analog. Not a torque spec.",
    },
    {
        "id": "lib.nut.m5",
        "class": "nut",
        "designation": "GENERIC_NUT_M5",
        "params": {"diameter_m": 0.005, "across_flats_m": 0.008},
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "ISO 4032 analog.",
    },
    {
        "id": "lib.washer.m5",
        "class": "washer",
        "designation": "GENERIC_WASHER_M5",
        "params": {"inner_diameter_m": 0.0053, "outer_diameter_m": 0.010, "thickness_m": 0.001},
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "ISO 7089 analog.",
    },
    {
        "id": "lib.shaft.d20",
        "class": "shaft",
        "designation": "GENERIC_SHAFT_D20",
        "params": {"diameter_m": 0.020},
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "Journal class for GENERIC_6204 inner diameter.",
    },
    {
        "id": "lib.motor.servo60",
        "class": "motor",
        "designation": "GENERIC_SERVO_ENVELOPE_60",
        "params": {"diameter_m": 0.060, "length_m": 0.075},
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "Servo envelope only. No winding, no catalog torque.",
    },
    {
        "id": "lib.gearbox.planetary80",
        "class": "gearbox",
        "designation": "GENERIC_PLANETARY_ENVELOPE_80",
        "params": {"diameter_m": 0.080, "length_m": 0.048},
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "Reduction envelope. Internal gears are not modeled.",
    },
    {
        "id": "lib.coupling.d20",
        "class": "coupling",
        "designation": "GENERIC_COUPLING_D20",
        "params": {"bore_m": 0.020, "od_m": 0.040, "length_m": 0.030},
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "Oldham/jaw envelope analog. Not a purchased PN.",
    },
    {
        "id": "lib.linear_bearing.lm12",
        "class": "linear_bearing",
        "designation": "GENERIC_LINEAR_BEARING_12",
        "params": {"inner_diameter_m": 0.012, "outer_diameter_m": 0.021, "length_m": 0.030},
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "LM analog envelope. Not a purchased PN.",
    },
    {
        "id": "lib.bushing.d20",
        "class": "bushing",
        "designation": "GENERIC_BUSHING_D20",
        "params": {"inner_diameter_m": 0.020, "outer_diameter_m": 0.026, "length_m": 0.020},
        "units": "m",
        "truth": "PARAMETRIC_REFERENCE",
        "note": "Plain bushing envelope.",
    },
]


def by_designation(name: str) -> dict | None:
    for c in GENERIC:
        if c["designation"] == name:
            return c
    return None
