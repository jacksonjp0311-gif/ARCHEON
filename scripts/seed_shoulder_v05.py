"""Author ARCHEON Arm shoulder as an ENGINEERING assembly.

Writes canonical DesignIR JSON. Does not mutate HELIX/Cortex.
Does not invent manufacturer catalog PNs.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARM = ROOT / "projects" / "archeon-arm"

PV = {
    "class": "GENERATED",
    "created_by": "assembly-designer",
    "reason": "",
    "requirement_ids": ["req.bearings", "req.service", "req.dof"],
    "agent_id": "assembly-designer",
    "tools": ["parametric_generator"],
    "evidence_ids": [],
    "revision_id": "rev.0002",
    "user_approved": True,
}


def pv(agent: str, reason: str, cls: str = "GENERATED", req=None, tools=None) -> dict:
    d = dict(PV)
    d["created_by"] = agent
    d["agent_id"] = agent
    d["reason"] = reason
    d["class"] = cls
    d["requirement_ids"] = req if req is not None else ["req.bearings", "req.service"]
    d["tools"] = tools if tools is not None else ["parametric_generator"]
    return d


def part(
    pid,
    name,
    role,
    material,
    origin,
    prim,
    stage,
    evec,
    edist,
    *,
    rpy=(0, 0, 0),
    catalog=None,
    cls=None,
    tier="primary",
    service=None,
    agent="cad-designer",
    reason="",
    pcls="GENERATED",
):
    return {
        "id": pid,
        "name": name,
        "parent": "asm.shoulder",
        "system": "sys.arm",
        "material": material,
        "semantic_role": role,
        "qty": 1,
        "catalog_ref": catalog,
        "component_class": cls,
        "detail_tier": tier,
        "spatial": {
            "origin_m": list(origin),
            "rpy_rad": list(rpy),
            "primitive": prim,
            "assembly_stage": stage,
            "explosion_vector": list(evec),
            "explosion_distance_m": edist,
            "radial_group": "shoulder",
            "parent_axis": "datum.j2",
            "service_path": service or [],
        },
        "provenance": pv(agent, reason, pcls),
    }


def main() -> None:
    existing = json.loads((ARM / "parts.json").read_text(encoding="utf-8"))
    keep = [p for p in existing["parts"] if not p["id"].startswith("part.shoulder.")]

    RY = (1.5708, 0, 0)  # cylinder local Z → world Y
    AXIS = (0.0, 0.0, 0.20)

    shoulder = [
        part(
            "part.shoulder.base",
            "Shoulder base",
            "shoulder_base",
            "mat.al6061",
            (0.0, 0.0, 0.128),
            {"kind": "box", "sx": 0.120, "sy": 0.090, "sz": 0.018},
            3,
            (0, 0, -1),
            0.10,
            reason="Mounting plate between yaw column and pitch housing.",
        ),
        part(
            "part.shoulder.housing",
            "Shoulder housing",
            "shoulder_housing",
            "mat.al6061",
            AXIS,
            {"kind": "box", "sx": 0.155, "sy": 0.096, "sz": 0.110},
            4,
            (0.25, 0, 1),
            0.16,
            service=[[0, 0, 0.20], [0, 0.22, 0.20]],
            reason="Machined housing around the pitch bearing pair.",
        ),
        part(
            "part.shoulder.motor",
            "Shoulder pitch motor envelope",
            "motor_envelope",
            "mat.al_anodized",
            (0.0, -0.132, 0.20),
            {"kind": "cylinder", "radius": 0.030, "height": 0.075},
            5,
            (0, -1, 0),
            0.20,
            rpy=RY,
            catalog="GENERIC_SERVO_ENVELOPE_60",
            cls="motor",
            agent="components",
            pcls="ASSUMED",
            reason="GENERIC servo envelope. Not a catalog motor PN. No winding model.",
        ),
        part(
            "part.shoulder.motor_mount",
            "Motor mount flange",
            "motor_mount",
            "mat.al6061",
            (0.0, -0.100, 0.20),
            {"kind": "cylinder", "radius": 0.038, "height": 0.008},
            6,
            (0, -1, 0),
            0.14,
            rpy=RY,
            reason="Front mounting flange between motor envelope and gearbox input. Bolt circle is PARAMETRIC_REFERENCE.",
        ),
        part(
            "part.shoulder.gearbox",
            "Reduction gearbox envelope",
            "gearbox_envelope",
            "mat.al_anodized",
            (0.0, -0.078, 0.20),
            {"kind": "cylinder", "radius": 0.040, "height": 0.048},
            6,
            (0, -1, 0),
            0.16,
            rpy=RY,
            catalog="GENERIC_PLANETARY_ENVELOPE_80",
            cls="gearbox",
            agent="components",
            pcls="ASSUMED",
            reason="GENERIC planetary envelope. Internal gears are not modeled.",
        ),
        part(
            "part.shoulder.shaft",
            "Drive shaft",
            "drive_shaft",
            "mat.steel",
            (0.0, -0.008, 0.20),
            {"kind": "cylinder", "radius": 0.010, "height": 0.118},
            7,
            (0, 1, 0),
            0.18,
            rpy=RY,
            catalog="GENERIC_SHAFT_D20",
            cls="shaft",
            reason="Journal Ø20 mm DERIVED from GENERIC_6204 inner diameter.",
        ),
        part(
            "part.shoulder.bearing.a",
            "Pitch bearing A",
            "bearing",
            "mat.bearing_steel",
            (0.0, -0.022, 0.20),
            {"kind": "cylinder", "radius": 0.0235, "height": 0.014},
            8,
            (0, -1, 0),
            0.14,
            rpy=RY,
            catalog="GENERIC_6204_BEARING",
            cls="bearing",
            agent="components",
            pcls="ASSUMED",
            reason="GENERIC_6204 envelope 20×47×14 mm. PARAMETRIC_REFERENCE, not SKF/NSK.",
        ),
        part(
            "part.shoulder.bearing.b",
            "Pitch bearing B",
            "bearing",
            "mat.bearing_steel",
            (0.0, 0.022, 0.20),
            {"kind": "cylinder", "radius": 0.0235, "height": 0.014},
            9,
            (0, 1, 0),
            0.14,
            rpy=RY,
            catalog="GENERIC_6204_BEARING",
            cls="bearing",
            agent="components",
            pcls="ASSUMED",
            reason="GENERIC_6204 envelope 20×47×14 mm. PARAMETRIC_REFERENCE, not SKF/NSK.",
        ),
        part(
            "part.shoulder.spacer",
            "Bearing spacer",
            "spacer",
            "mat.steel",
            AXIS,
            {"kind": "cylinder", "radius": 0.016, "height": 0.016},
            10,
            (0, 0.2, 0),
            0.10,
            rpy=RY,
            cls="spacer",
            reason="Axial spacer between bearing inner rings.",
        ),
        part(
            "part.shoulder.retainer.a",
            "Bearing retainer A",
            "bearing_retainer",
            "mat.steel_black_oxide",
            (0.0, -0.032, 0.20),
            {"kind": "cylinder", "radius": 0.027, "height": 0.003},
            11,
            (0, -1, 0),
            0.12,
            rpy=RY,
            reason="Retention ring outboard of bearing A.",
        ),
        part(
            "part.shoulder.retainer.b",
            "Bearing retainer B",
            "bearing_retainer",
            "mat.steel_black_oxide",
            (0.0, 0.032, 0.20),
            {"kind": "cylinder", "radius": 0.027, "height": 0.003},
            12,
            (0, 1, 0),
            0.12,
            rpy=RY,
            reason="Retention ring outboard of bearing B.",
        ),
        part(
            "part.shoulder.mount.upper",
            "Upper arm mount",
            "upper_arm_mount",
            "mat.al6061",
            (0.084, 0.0, 0.20),
            {"kind": "box", "sx": 0.014, "sy": 0.070, "sz": 0.070},
            13,
            (1, 0, 0),
            0.16,
            reason="Interface plate from pitch shaft/housing to the upper-arm link.",
        ),
        part(
            "part.shoulder.cover",
            "Service cover",
            "service_cover",
            "mat.al6061",
            (0.0, 0.0, 0.258),
            {"kind": "box", "sx": 0.100, "sy": 0.070, "sz": 0.005},
            14,
            (0, 0, 1),
            0.14,
            service=[[0, 0, 0.258], [0, 0, 0.40]],
            reason="Removable cover for bearing/service access.",
        ),
        part(
            "part.shoulder.grommet",
            "Cable passage grommet",
            "cable_passage",
            "mat.rubber",
            (-0.082, 0.0, 0.20),
            {"kind": "cylinder", "radius": 0.008, "height": 0.012},
            15,
            (-1, 0, 0),
            0.10,
            rpy=(0, 1.5708, 0),
            cls="grommet",
            reason="Cable passage through the housing wall. Not a harness model.",
        ),
        part(
            "part.shoulder.encoder_mount",
            "Encoder mount",
            "encoder_mount",
            "mat.al6061",
            (0.0, -0.176, 0.20),
            {"kind": "box", "sx": 0.040, "sy": 0.006, "sz": 0.040},
            16,
            (0, -1, 0),
            0.18,
            reason="Rear plate for a GENERIC encoder envelope. Encoder itself is not a purchased PN.",
        ),
    ]

    # Cover bolts M4 × 4, housing-to-base M5 × 4
    cover_xy = [(-0.038, -0.024), (0.038, -0.024), (0.038, 0.024), (-0.038, 0.024)]
    for i, (x, y) in enumerate(cover_xy, 1):
        shoulder.append(
            part(
                f"part.shoulder.bolt.cover.{i}",
                f"Cover bolt {i}",
                "fastener",
                "mat.steel_black_oxide",
                (x, y, 0.266),
                {"kind": "cylinder", "radius": 0.002, "height": 0.012},
                17,
                (0, 0, 1),
                0.08,
                catalog="GENERIC_SHCS_M4",
                cls="bolt",
                tier="instance",
                agent="components",
                pcls="ASSUMED",
                reason="Cosmetic M4 SHCS analog. Thread is THREAD_REFERENCE.",
            )
        )
    base_xy = [(-0.045, -0.032), (0.045, -0.032), (0.045, 0.032), (-0.045, 0.032)]
    for i, (x, y) in enumerate(base_xy, 1):
        shoulder.append(
            part(
                f"part.shoulder.bolt.base.{i}",
                f"Housing base bolt {i}",
                "fastener",
                "mat.steel_black_oxide",
                (x, y, 0.140),
                {"kind": "cylinder", "radius": 0.0025, "height": 0.016},
                18,
                (0, 0, -1),
                0.08,
                catalog="GENERIC_SHCS_M5",
                cls="bolt",
                tier="instance",
                agent="components",
                pcls="ASSUMED",
                reason="Cosmetic M5 SHCS analog. Thread is THREAD_REFERENCE.",
            )
        )

    (ARM / "parts.json").write_text(
        json.dumps({"parts": keep + shoulder}, indent=2) + "\n", encoding="utf-8"
    )

    assemblies = json.loads((ARM / "assemblies.json").read_text(encoding="utf-8"))
    children = [p["id"] for p in shoulder]
    for a in assemblies["assemblies"]:
        if a["id"] == "asm.shoulder":
            a["children"] = children
            a["provenance"]["reason"] = (
                "Interface-first pitch joint: motor, gearbox, shaft, bearing pair, housing, mount, fasteners, cover."
            )
            a["provenance"]["revision_id"] = "rev.0002"
    (ARM / "assemblies.json").write_text(json.dumps(assemblies, indent=2) + "\n", encoding="utf-8")

    # Features
    features = [
        {
            "id": "feat.base.plate.box",
            "part": "part.base.plate",
            "kind": "box",
            "semantic_role": "body",
            "params": {"sx": 0.22, "sy": 0.22, "sz": 0.02},
            "provenance": pv("cad-designer", "Plate extrusion analog.", req=[]),
        },
        {
            "id": "feat.shoulder.housing.body",
            "part": "part.shoulder.housing",
            "kind": "box",
            "semantic_role": "housing_body",
            "params": {"sx": 0.155, "sy": 0.096, "sz": 0.110},
            "provenance": pv("cad-designer", "Housing envelope."),
        },
        {
            "id": "feat.shoulder.housing.seat_a",
            "part": "part.shoulder.housing",
            "kind": "bearing_seat",
            "semantic_role": "bearing_seat",
            "params": {
                "diameter_m": 0.047,
                "depth_m": 0.014,
                "origin": "DERIVED",
                "note": "Seat DERIVED from GENERIC_6204 OD. Fit class ASSUMED — not H7.",
            },
            "provenance": pv("cad-designer", "Inboard bearing seat.", cls="DERIVED"),
        },
        {
            "id": "feat.shoulder.housing.seat_b",
            "part": "part.shoulder.housing",
            "kind": "bearing_seat",
            "semantic_role": "bearing_seat",
            "params": {"diameter_m": 0.047, "depth_m": 0.014, "origin": "DERIVED"},
            "provenance": pv("cad-designer", "Outboard bearing seat.", cls="DERIVED"),
        },
        {
            "id": "feat.shoulder.housing.cable",
            "part": "part.shoulder.housing",
            "kind": "cable_passage",
            "semantic_role": "cable_passage",
            "params": {"diameter_m": 0.016, "depth_m": 0.020, "origin": "ASSUMED"},
            "provenance": pv("cad-designer", "Cable passage through -X wall.", cls="ASSUMED"),
        },
        {
            "id": "feat.shoulder.housing.cover_holes",
            "part": "part.shoulder.housing",
            "kind": "mount_pattern",
            "semantic_role": "cover_fasteners",
            "params": {"count": 4, "diameter_m": 0.0044, "hole_type": "through"},
            "provenance": pv("cad-designer", "Host holes for cover FastenerGroup."),
        },
        {
            "id": "feat.shoulder.housing.base_holes",
            "part": "part.shoulder.base",
            "kind": "mount_pattern",
            "semantic_role": "base_fasteners",
            "params": {"count": 4, "diameter_m": 0.0055, "hole_type": "through"},
            "provenance": pv("cad-designer", "Host holes for housing-to-base FastenerGroup."),
        },
        {
            "id": "feat.shoulder.motor.flange",
            "part": "part.shoulder.motor",
            "kind": "flange",
            "semantic_role": "motor_flange",
            "params": {"od_m": 0.072, "thickness_m": 0.007, "origin": "ASSUMED"},
            "provenance": pv("cad-designer", "Motor front flange analog. Not a manufacturer face.", cls="ASSUMED"),
        },
        {
            "id": "feat.shoulder.gearbox.flange",
            "part": "part.shoulder.gearbox",
            "kind": "flange",
            "semantic_role": "gearbox_flange",
            "params": {"od_m": 0.088, "thickness_m": 0.006, "origin": "ASSUMED"},
            "provenance": pv("cad-designer", "Gearbox output flange analog.", cls="ASSUMED"),
        },
        {
            "id": "feat.shoulder.bearing.a.bore",
            "part": "part.shoulder.bearing.a",
            "kind": "hole",
            "semantic_role": "bearing_bore",
            "params": {"inner_r_m": 0.010, "diameter_m": 0.020, "origin": "DERIVED"},
            "provenance": pv("cad-designer", "Bearing ID DERIVED from GENERIC_6204.", cls="DERIVED"),
        },
        {
            "id": "feat.shoulder.bearing.b.bore",
            "part": "part.shoulder.bearing.b",
            "kind": "hole",
            "semantic_role": "bearing_bore",
            "params": {"inner_r_m": 0.010, "diameter_m": 0.020, "origin": "DERIVED"},
            "provenance": pv("cad-designer", "Bearing ID DERIVED from GENERIC_6204.", cls="DERIVED"),
        },
        {
            "id": "feat.shoulder.retainer.a.bore",
            "part": "part.shoulder.retainer.a",
            "kind": "hole",
            "semantic_role": "retainer_bore",
            "params": {"inner_r_m": 0.021, "diameter_m": 0.042, "origin": "ASSUMED"},
            "provenance": pv("cad-designer", "Retainer lip over bearing outer race.", cls="ASSUMED"),
        },
        {
            "id": "feat.shoulder.retainer.b.bore",
            "part": "part.shoulder.retainer.b",
            "kind": "hole",
            "semantic_role": "retainer_bore",
            "params": {"inner_r_m": 0.021, "diameter_m": 0.042, "origin": "ASSUMED"},
            "provenance": pv("cad-designer", "Retainer lip over bearing outer race.", cls="ASSUMED"),
        },
        {
            "id": "feat.shoulder.motor_mount.pattern",
            "part": "part.shoulder.motor_mount",
            "kind": "mount_pattern",
            "semantic_role": "motor_flange_bolts",
            "params": {"count": 4, "bolt_circle_m": 0.050, "diameter_m": 0.004},
            "provenance": pv("cad-designer", "GENERIC four-bolt motor flange pattern."),
        },
        {
            "id": "feat.shoulder.shaft.journal",
            "part": "part.shoulder.shaft",
            "kind": "cylinder",
            "semantic_role": "journal",
            "params": {"radius_m": 0.010, "height_m": 0.118, "origin": "DERIVED"},
            "provenance": pv("cad-designer", "Journal DERIVED from GENERIC_6204 ID.", cls="DERIVED"),
        },
        {
            "id": "feat.shoulder.shaft.step",
            "part": "part.shoulder.shaft",
            "kind": "shaft_step",
            "semantic_role": "retention_shoulder",
            "params": {"diameter_m": 0.024, "length_m": 0.008, "origin": "ASSUMED"},
            "provenance": pv("cad-designer", "Retention shoulder. Fit ASSUMED.", cls="ASSUMED"),
        },
        {
            "id": "feat.shoulder.spacer.bore",
            "part": "part.shoulder.spacer",
            "kind": "bearing_seat",
            "semantic_role": "spacer_bore",
            "params": {"diameter_m": 0.020, "inner_r_m": 0.010},
            "provenance": pv("cad-designer", "Spacer bore matches shaft journal.", cls="DERIVED"),
        },
        {
            "id": "feat.upper.extrude",
            "part": "part.upper_arm.tube",
            "kind": "extrude",
            "semantic_role": "link_body",
            "params": {"depth_m": 0.40, "driven_by": "upper_arm.length"},
            "provenance": pv("cad-designer", "Link solid driven by parameter.", req=["req.reach"]),
        },
        {
            "id": "feat.shoulder.cover.body",
            "part": "part.shoulder.cover",
            "kind": "box",
            "semantic_role": "service_cover",
            "params": {"sx": 0.100, "sy": 0.070, "sz": 0.005},
            "provenance": pv("cad-designer", "Service cover."),
        },
        {
            "id": "feat.shoulder.mount.flange",
            "part": "part.shoulder.mount.upper",
            "kind": "flange",
            "semantic_role": "upper_arm_flange",
            "params": {"sx": 0.014, "sy": 0.070, "sz": 0.070},
            "provenance": pv("cad-designer", "Upper-arm interface flange. SEMANTIC until OCCT authors the ring."),
        },
        {
            "id": "feat.shoulder.bolt.thread",
            "part": "part.shoulder.bolt.cover.1",
            "kind": "thread_reference",
            "semantic_role": "thread_reference",
            "params": {"designation": "M4x0.7", "mode": "cosmetic"},
            "provenance": pv("components", "Thread reference only. Helix BREP not generated.", cls="ASSUMED"),
        },
    ]
    datums = json.loads((ARM / "features.json").read_text(encoding="utf-8"))["datums"]
    constraints = json.loads((ARM / "features.json").read_text(encoding="utf-8"))["constraints"]
    (ARM / "features.json").write_text(
        json.dumps({"datums": datums, "features": features, "constraints": constraints}, indent=2)
        + "\n",
        encoding="utf-8",
    )

    iface = json.loads((ARM / "interfaces.json").read_text(encoding="utf-8"))
    extra_ports = [
        {
            "id": "port.motor.output",
            "host": "part.shoulder.motor",
            "role": "motor_output",
            "datum": "datum.j2",
            "origin_m": [0.0, -0.095, 0.20],
            "provenance": pv("assembly-designer", "MotorOutputPort — interface first."),
        },
        {
            "id": "port.gearbox.input",
            "host": "part.shoulder.gearbox",
            "role": "gearbox_input",
            "datum": "datum.j2",
            "origin_m": [0.0, -0.102, 0.20],
            "provenance": pv("assembly-designer", "GearboxInputPort."),
        },
        {
            "id": "port.gearbox.output",
            "host": "part.shoulder.gearbox",
            "role": "gearbox_output",
            "datum": "datum.j2",
            "origin_m": [0.0, -0.054, 0.20],
            "provenance": pv("assembly-designer", "Gearbox output to shaft."),
        },
        {
            "id": "port.seat.a",
            "host": "part.shoulder.housing",
            "role": "bearing_seat",
            "datum": "datum.j2",
            "origin_m": [0.0, -0.022, 0.20],
            "provenance": pv("assembly-designer", "BearingSeatA."),
        },
        {
            "id": "port.seat.b",
            "host": "part.shoulder.housing",
            "role": "bearing_seat",
            "datum": "datum.j2",
            "origin_m": [0.0, 0.022, 0.20],
            "provenance": pv("assembly-designer", "BearingSeatB."),
        },
        {
            "id": "port.bearing.a.od",
            "host": "part.shoulder.bearing.a",
            "role": "bearing_od",
            "datum": "datum.j2",
            "origin_m": [0.0, -0.022, 0.20],
            "provenance": pv("assembly-designer", "Bearing A OD."),
        },
        {
            "id": "port.bearing.b.od",
            "host": "part.shoulder.bearing.b",
            "role": "bearing_od",
            "datum": "datum.j2",
            "origin_m": [0.0, 0.022, 0.20],
            "provenance": pv("assembly-designer", "Bearing B OD."),
        },
        {
            "id": "port.shaft.journal.a",
            "host": "part.shoulder.shaft",
            "role": "radial_bearing_journal",
            "datum": "datum.j2",
            "origin_m": [0.0, -0.022, 0.20],
            "provenance": pv("assembly-designer", "Journal A."),
        },
        {
            "id": "port.shaft.journal.b",
            "host": "part.shoulder.shaft",
            "role": "radial_bearing_journal",
            "datum": "datum.j2",
            "origin_m": [0.0, 0.022, 0.20],
            "provenance": pv("assembly-designer", "Journal B."),
        },
        {
            "id": "port.mount.upper",
            "host": "part.shoulder.mount.upper",
            "role": "upper_arm_mount",
            "datum": "datum.j2",
            "origin_m": [0.091, 0.0, 0.20],
            "provenance": pv("assembly-designer", "UpperArmMount."),
        },
        {
            "id": "port.cover.access",
            "host": "part.shoulder.cover",
            "role": "service_access",
            "datum": "datum.j2",
            "origin_m": [0.0, 0.0, 0.258],
            "provenance": pv("assembly-designer", "ServiceAccess."),
        },
        {
            "id": "port.housing.cover",
            "host": "part.shoulder.housing",
            "role": "service_access",
            "datum": "datum.j2",
            "origin_m": [0.0, 0.0, 0.255],
            "provenance": pv("assembly-designer", "Housing service face."),
        },
    ]
    # Keep existing ports; add extras (skip dups)
    have = {p["id"] for p in iface["ports"]}
    for p in extra_ports:
        if p["id"] not in have:
            iface["ports"].append(p)

    extra_ifaces = [
        {
            "id": "iface.motor.gearbox",
            "name": "MotorOutputPort–GearboxInputPort",
            "kind": "mechanical",
            "a": "port.motor.output",
            "b": "port.gearbox.input",
            "semantic_role": "drive_coupling",
            "provenance": pv("assembly-designer", "Interface-first drive."),
        },
        {
            "id": "iface.gearbox.shaft",
            "name": "Gearbox output to shaft",
            "kind": "mechanical",
            "a": "port.gearbox.output",
            "b": "port.shaft.journal.a",
            "semantic_role": "shaft_drive",
            "provenance": pv("assembly-designer", "Gearbox to shaft."),
        },
        {
            "id": "iface.seat.a",
            "name": "BearingSeatA",
            "kind": "mechanical",
            "a": "port.seat.a",
            "b": "port.bearing.a.od",
            "semantic_role": "bearing_seat",
            "provenance": pv("assembly-designer", "Seat A to bearing A OD.", cls="DERIVED"),
        },
        {
            "id": "iface.seat.b",
            "name": "BearingSeatB",
            "kind": "mechanical",
            "a": "port.seat.b",
            "b": "port.bearing.b.od",
            "semantic_role": "bearing_seat",
            "provenance": pv("assembly-designer", "Seat B to bearing B OD.", cls="DERIVED"),
        },
        {
            "id": "iface.journal.a",
            "name": "Journal A",
            "kind": "mechanical",
            "a": "port.shaft.journal.a",
            "b": "port.bearing.a.od",
            "semantic_role": "journal",
            "provenance": pv("assembly-designer", "Shaft journal A. Semantic — OD port is the bearing host."),
        },
        {
            "id": "iface.journal.b",
            "name": "Journal B",
            "kind": "mechanical",
            "a": "port.shaft.journal.b",
            "b": "port.bearing.b.od",
            "semantic_role": "journal",
            "provenance": pv("assembly-designer", "Shaft journal B."),
        },
        {
            "id": "iface.service.cover",
            "name": "ServiceAccess",
            "kind": "mechanical",
            "a": "port.cover.access",
            "b": "port.housing.cover",
            "semantic_role": "service_access",
            "provenance": pv("assembly-designer", "Cover to housing service face."),
        },
        {
            "id": "iface.upper.mount",
            "name": "UpperArmMount",
            "kind": "mechanical",
            "a": "port.mount.upper",
            "b": "port.upper.j2",
            "semantic_role": "upper_arm_mount",
            "provenance": pv("assembly-designer", "Mount plate to upper-arm root."),
        },
    ]
    have_i = {i["id"] for i in iface["interfaces"]}
    for i in extra_ifaces:
        if i["id"] not in have_i:
            iface["interfaces"].append(i)

    extra_mates = [
        {
            "id": "mate.motor.gearbox",
            "interface": "iface.motor.gearbox",
            "kind": "concentric",
            "offset_m": 0,
            "provenance": pv("constraint-engineer", "Semantic concentric. No solver.", cls="ASSUMED"),
        },
        {
            "id": "mate.seat.a",
            "interface": "iface.seat.a",
            "kind": "concentric",
            "offset_m": 0,
            "provenance": pv("constraint-engineer", "Semantic concentric.", cls="ASSUMED"),
        },
        {
            "id": "mate.seat.b",
            "interface": "iface.seat.b",
            "kind": "concentric",
            "offset_m": 0,
            "provenance": pv("constraint-engineer", "Semantic concentric.", cls="ASSUMED"),
        },
        {
            "id": "mate.journal.b",
            "interface": "iface.journal.b",
            "kind": "concentric",
            "offset_m": 0,
            "provenance": pv("constraint-engineer", "Semantic concentric.", cls="ASSUMED"),
        },
        {
            "id": "mate.service.cover",
            "interface": "iface.service.cover",
            "kind": "coincident",
            "offset_m": 0.001,
            "provenance": pv("constraint-engineer", "Cover gap 1 mm ASSUMED.", cls="ASSUMED"),
        },
        {
            "id": "mate.upper.mount",
            "interface": "iface.upper.mount",
            "kind": "fixed",
            "offset_m": 0,
            "provenance": pv("constraint-engineer", "Mount to upper arm. Semantic.", cls="ASSUMED"),
        },
    ]
    have_m = {m["id"] for m in iface["mates"]}
    for m in extra_mates:
        if m["id"] not in have_m:
            iface["mates"].append(m)
    (ARM / "interfaces.json").write_text(json.dumps(iface, indent=2) + "\n", encoding="utf-8")

    seq = [
        "part.base.plate",
        "part.base.column",
        "part.shoulder.base",
        "part.shoulder.housing",
        "part.shoulder.motor",
        "part.shoulder.motor_mount",
        "part.shoulder.gearbox",
        "part.shoulder.shaft",
        "part.shoulder.bearing.a",
        "part.shoulder.spacer",
        "part.shoulder.bearing.b",
        "part.shoulder.retainer.a",
        "part.shoulder.retainer.b",
        "part.shoulder.mount.upper",
        "part.shoulder.cover",
        "part.shoulder.grommet",
        "part.shoulder.encoder_mount",
        "part.shoulder.bolt.cover.1",
        "part.shoulder.bolt.cover.2",
        "part.shoulder.bolt.cover.3",
        "part.shoulder.bolt.cover.4",
        "part.shoulder.bolt.base.1",
        "part.shoulder.bolt.base.2",
        "part.shoulder.bolt.base.3",
        "part.shoulder.bolt.base.4",
        "part.upper_arm.tube",
        "part.elbow.housing",
        "part.forearm.tube",
        "part.wrist.housing",
        "part.ee.adapter",
    ]
    (ARM / "assembly_sequence.json").write_text(
        json.dumps(
            {
                "sequence": seq,
                "note": "Forward install order. SEQUENCE explosion runs the reverse. Shoulder stack is coaxial on datum.j2.",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    # Materials
    mats = json.loads((ARM / "materials.json").read_text(encoding="utf-8"))
    extra_mats = [
        {
            "id": "mat.al_anodized",
            "name": "Anodized aluminium (handbook density of 6061)",
            "density_kg_m3": 2700,
            "appearance": "anodized_aluminum",
            "notes": "Density SOURCE (6061 handbook). Anodize is ASSUMED appearance, not a qualified coating spec.",
            "provenance": pv("cad-designer", "Appearance class for motor/gearbox envelopes.", cls="SOURCE", req=[]),
        },
        {
            "id": "mat.bearing_steel",
            "name": "Bearing steel (handbook density)",
            "density_kg_m3": 7810,
            "appearance": "steel",
            "notes": "Density SOURCE. Grade UNVERIFIED. Not AISI 52100 certified.",
            "provenance": pv("components", "Handbook density only.", cls="SOURCE"),
        },
        {
            "id": "mat.steel_black_oxide",
            "name": "Carbon steel with black-oxide appearance",
            "density_kg_m3": 7850,
            "appearance": "black_oxide_steel",
            "notes": "Density SOURCE. Coating is appearance only.",
            "provenance": pv("components", "Handbook density. Black oxide is visual.", cls="SOURCE"),
        },
        {
            "id": "mat.rubber",
            "name": "Generic elastomer (handbook density)",
            "density_kg_m3": 1200,
            "appearance": "rubber",
            "notes": "Density ASSUMED. Compound UNVERIFIED.",
            "provenance": pv("components", "Grommet elastomer.", cls="ASSUMED", req=["req.service"]),
        },
        {
            "id": "mat.polymer",
            "name": "Generic engineering polymer",
            "density_kg_m3": 1400,
            "appearance": "polymer",
            "notes": "Unused in the current shoulder. Reserved class.",
            "provenance": pv("components", "Appearance class.", cls="ASSUMED", req=[]),
        },
        {
            "id": "mat.stainless",
            "name": "Generic stainless steel (handbook density)",
            "density_kg_m3": 8000,
            "appearance": "stainless_steel",
            "notes": "Reserved class. Grade UNVERIFIED.",
            "provenance": pv("components", "Appearance class.", cls="SOURCE", req=[]),
        },
        {
            "id": "mat.composite",
            "name": "Generic composite",
            "density_kg_m3": None,
            "appearance": "composite",
            "notes": "No density claimed.",
            "provenance": pv("components", "Appearance class only.", cls="UNVERIFIED", req=[]),
        },
    ]
    have_m = {m["id"] for m in mats["materials"]}
    for m in mats["materials"]:
        if m["id"] == "mat.al6061" and "appearance" not in m:
            m["appearance"] = "machined_aluminum"
        if m["id"] == "mat.steel" and "appearance" not in m:
            m["appearance"] = "steel"
    for m in extra_mats:
        if m["id"] not in have_m:
            mats["materials"].append(m)
    (ARM / "materials.json").write_text(json.dumps(mats, indent=2) + "\n", encoding="utf-8")

    import sys

    sys.path.insert(0, str(ROOT / "workers" / "cad-occt"))
    from archeon_cad.library import GENERIC  # type: ignore

    lib_ents = []
    for c in GENERIC:
        lib_ents.append(
            {
                **c,
                "provenance": pv("components", c["note"], cls="ASSUMED", req=["req.bearings"]),
            }
        )
    (ARM / "library.json").write_text(
        json.dumps(
            {
                "component_library": lib_ents,
                "detail_budget": [
                    {"role": "housing", "tier": "primary", "render": "high"},
                    {"role": "shaft", "tier": "primary", "render": "high"},
                    {"role": "bearing", "tier": "primary", "render": "high"},
                    {"role": "motor_envelope", "tier": "primary", "render": "high"},
                    {"role": "gearbox_envelope", "tier": "primary", "render": "high"},
                    {"role": "fastener", "tier": "instance", "render": "instance"},
                    {"role": "cable_passage", "tier": "primary", "render": "high"},
                    {"role": "grommet", "tier": "hidden", "render": "low"},
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    (ARM / "fasteners.json").write_text(
        json.dumps(
            {
                "fastener_groups": [
                    {
                        "id": "fastener.shoulder.cover",
                        "host": "part.shoulder.housing",
                        "bolt_type": "GENERIC_SHCS_M4",
                        "diameter_m": 0.004,
                        "count": 4,
                        "bolt_circle_m": None,
                        "hole_type": "through",
                        "washer": False,
                        "nut": False,
                        "torque_reference": "STANDARD_REFERENCE ISO 4762 analog — not a torque spec",
                        "instance_ids": [f"part.shoulder.bolt.cover.{i}" for i in range(1, 5)],
                        "provenance": pv("components", "Cover fastener group. Threads cosmetic.", cls="ASSUMED"),
                    },
                    {
                        "id": "fastener.shoulder.base",
                        "host": "part.shoulder.base",
                        "bolt_type": "GENERIC_SHCS_M5",
                        "diameter_m": 0.005,
                        "count": 4,
                        "bolt_circle_m": None,
                        "hole_type": "through",
                        "washer": False,
                        "nut": False,
                        "torque_reference": "STANDARD_REFERENCE ISO 4762 analog — not a torque spec",
                        "instance_ids": [f"part.shoulder.bolt.base.{i}" for i in range(1, 5)],
                        "provenance": pv("components", "Housing-to-base fastener group.", cls="ASSUMED"),
                    },
                ]
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    (ARM / "fits.json").write_text(
        json.dumps(
            {
                "fit_relations": [
                    {
                        "id": "fit.journal.6204",
                        "name": "shaft journal to GENERIC_6204 ID",
                        "a": "part.shoulder.shaft",
                        "b": "part.shoulder.bearing.a",
                        "quantity": "journal_diameter",
                        "a_value_m": 0.020,
                        "b_value_m": 0.020,
                        "clearance_m": 0.0,
                        "origin": "DERIVED",
                        "note": "Journal equals bearing ID. Transition/press class ASSUMED — not ISO 286.",
                        "provenance": pv("constraint-engineer", "Derived from library ID.", cls="DERIVED"),
                    },
                    {
                        "id": "fit.seat.6204",
                        "name": "housing seat to GENERIC_6204 OD",
                        "a": "part.shoulder.housing",
                        "b": "part.shoulder.bearing.a",
                        "quantity": "seat_diameter",
                        "a_value_m": 0.047,
                        "b_value_m": 0.047,
                        "clearance_m": 0.0,
                        "origin": "DERIVED",
                        "note": "Seat equals bearing OD. Housing fit class ASSUMED — not H7.",
                        "provenance": pv("constraint-engineer", "Derived from library OD.", cls="DERIVED"),
                    },
                    {
                        "id": "fit.wall",
                        "name": "housing wall around bearing OD",
                        "a": "part.shoulder.housing",
                        "b": "part.shoulder.bearing.a",
                        "quantity": "wall_thickness",
                        "a_value_m": 0.008,
                        "b_value_m": 0.0,
                        "clearance_m": 0.008,
                        "origin": "ASSUMED",
                        "note": "8 mm wall ASSUMED. Not a stress-sized wall.",
                        "provenance": pv("cad-designer", "Assumed wall.", cls="ASSUMED"),
                    },
                    {
                        "id": "fit.cover.gap",
                        "name": "service cover gap",
                        "a": "part.shoulder.cover",
                        "b": "part.shoulder.housing",
                        "quantity": "assembly_gap",
                        "a_value_m": 0.001,
                        "b_value_m": 0.0,
                        "clearance_m": 0.001,
                        "origin": "ASSUMED",
                        "note": "1 mm cover clearance ASSUMED.",
                        "provenance": pv("assembly-designer", "Cover gap.", cls="ASSUMED"),
                    },
                    {
                        "id": "fit.fastener.clearance",
                        "name": "M5 through-hole clearance",
                        "a": "part.shoulder.base",
                        "b": "part.shoulder.bolt.base.1",
                        "quantity": "fastener_clearance",
                        "a_value_m": 0.0055,
                        "b_value_m": 0.005,
                        "clearance_m": 0.0005,
                        "origin": "STANDARD_REFERENCE",
                        "note": "Clearance hole analog of ISO 273 medium. Not a qualified hole table.",
                        "provenance": pv("dfm", "Standard-reference clearance.", cls="ASSUMED"),
                    },
                ]
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    (ARM / "assembly_plan.json").write_text(
        json.dumps(
            {
                "assembly_plans": [
                    {
                        "id": "plan.shoulder",
                        "name": "ShoulderAssembly",
                        "assembly": "asm.shoulder",
                        "nodes": [
                            {"id": "part.shoulder.motor", "role": "Motor", "component_class": "motor", "children": []},
                            {
                                "id": "part.shoulder.gearbox",
                                "role": "ReductionGearbox",
                                "component_class": "gearbox",
                                "children": [],
                            },
                            {"id": "part.shoulder.shaft", "role": "DriveShaft", "component_class": "shaft", "children": []},
                            {
                                "id": "part.shoulder.bearing.a",
                                "role": "BearingPair",
                                "component_class": "bearing",
                                "children": ["part.shoulder.bearing.b"],
                            },
                            {
                                "id": "part.shoulder.housing",
                                "role": "ShoulderHousing",
                                "component_class": "housing",
                                "children": [],
                            },
                            {
                                "id": "part.shoulder.mount.upper",
                                "role": "UpperArmInterface",
                                "component_class": "flange",
                                "children": [],
                            },
                            {
                                "id": "part.shoulder.encoder_mount",
                                "role": "EncoderMount",
                                "component_class": "bracket",
                                "children": [],
                            },
                            {
                                "id": "part.shoulder.cover",
                                "role": "ServiceCover",
                                "component_class": "cover",
                                "children": [],
                            },
                        ],
                        "interfaces": [
                            "iface.motor.gearbox",
                            "iface.gearbox.shaft",
                            "iface.seat.a",
                            "iface.seat.b",
                            "iface.j2",
                            "iface.service.cover",
                            "iface.upper.mount",
                        ],
                        "load_path": [
                            "part.shoulder.mount.upper",
                            "part.shoulder.shaft",
                            "part.shoulder.bearing.a",
                            "part.shoulder.bearing.b",
                            "part.shoulder.housing",
                            "part.shoulder.base",
                        ],
                        "rotating": [
                            "part.shoulder.motor",
                            "part.shoulder.gearbox",
                            "part.shoulder.shaft",
                            "part.shoulder.bearing.a",
                            "part.shoulder.bearing.b",
                            "part.shoulder.spacer",
                            "part.shoulder.mount.upper",
                        ],
                        "service": ["part.shoulder.cover", "part.shoulder.grommet", "part.shoulder.encoder_mount"],
                        "provenance": pv(
                            "assembly-designer",
                            "Plan before geometry: attached / how / load / rotate / service / manufacture.",
                        ),
                    }
                ]
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    params = json.loads((ARM / "parameters.json").read_text(encoding="utf-8"))
    params["parameters"]["design.fidelity"] = {
        "name": "design.fidelity",
        "value": 2,
        "unit": "enum",
        "si": 2,
        "provenance": pv(
            "architect",
            "1=CONCEPT 2=ENGINEERING 3=DETAILED. Default ENGINEERING.",
            cls="USER_LOCKED",
            req=[],
        ),
    }
    params["parameters"]["shoulder.bearing.od"] = {
        "name": "shoulder.bearing.od",
        "value": 47,
        "unit": "mm",
        "si": 0.047,
        "provenance": pv("components", "GENERIC_6204 OD. PARAMETRIC_REFERENCE.", cls="ASSUMED"),
    }
    params["parameters"]["shoulder.bearing.id"] = {
        "name": "shoulder.bearing.id",
        "value": 20,
        "unit": "mm",
        "si": 0.020,
        "provenance": pv("components", "GENERIC_6204 ID. PARAMETRIC_REFERENCE.", cls="ASSUMED"),
    }
    params["parameters"]["shoulder.wall"] = {
        "name": "shoulder.wall",
        "value": 8,
        "unit": "mm",
        "si": 0.008,
        "provenance": pv("cad-designer", "Housing wall ASSUMED.", cls="ASSUMED"),
    }
    (ARM / "parameters.json").write_text(json.dumps(params, indent=2) + "\n", encoding="utf-8")

    proj = json.loads((ARM / "project.json").read_text(encoding="utf-8"))
    proj["description"] = (
        "Six-axis benchtop arm. v0.5 ENGINEERING shoulder: interface-first bearing-supported pitch joint. "
        "Not a production robot."
    )
    proj["revision_id"] = "rev.0002"
    proj["fidelity"] = "ENGINEERING"
    proj["kernel"] = "primitive"
    (ARM / "project.json").write_text(json.dumps(proj, indent=2) + "\n", encoding="utf-8")

    print(f"shoulder parts: {len(shoulder)}")
    print(f"total parts: {len(keep) + len(shoulder)}")


if __name__ == "__main__":
    main()
