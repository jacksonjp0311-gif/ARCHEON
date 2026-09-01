"""Measure generative fidelity from the live ARCHEON Arm project. Do not invent scores."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "workers" / "cad-occt"))
sys.path.insert(0, str(ROOT / "crates" / "archeon-design-ir"))

ARM = ROOT / "projects" / "archeon-arm"


def load_json(name: str) -> dict:
    p = ARM / name
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8"))


def main() -> None:
    parts = load_json("parts.json").get("parts") or []
    ifaces = load_json("interfaces.json")
    ports = ifaces.get("ports") or []
    interfaces = ifaces.get("interfaces") or []
    features = load_json("features.json").get("features") or []
    plan = load_json("assembly_plan.json").get("assembly_plans") or []
    fasteners = load_json("fasteners.json").get("fastener_groups") or []
    fits = load_json("fits.json").get("fit_relations") or []
    manifest_path = ARM / "generated" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}

    used = set()
    for i in interfaces:
        used.add(i.get("a"))
        used.add(i.get("b"))
    port_ids = [p["id"] for p in ports]
    iface_complete = sum(1 for p in port_ids if p in used)

    required_roles = {
        "shoulder_base",
        "shoulder_housing",
        "motor_envelope",
        "gearbox_envelope",
        "drive_shaft",
        "bearing",
        "bearing_retainer",
        "upper_arm_mount",
        "service_cover",
        "cable_passage",
        "fastener",
    }
    present_roles = {p.get("semantic_role") for p in parts}
    missing_roles = sorted(required_roles - present_roles)

    exact = [p for p in manifest.get("parts") or [] if p.get("exact")]
    failed = manifest.get("failures") or []
    stl = list((ARM / "generated").glob("part_shoulder_*.stl")) if (ARM / "generated").exists() else []

    result = {
        "version": "0.5.0",
        "prompts": {
            "A": "Design a bearing-supported rotating shaft.",
            "B": "Design a motor-driven shoulder joint.",
            "C": "Design an electronics enclosure with removable lid. (generator unit test — not a second product)",
            "D": "Design a structural bracket with four mounting bolts. (encoder mount + BracketGenerator)",
        },
        "semantic_completeness": {
            "required_roles": sorted(required_roles),
            "missing_roles": missing_roles,
            "complete": not missing_roles,
        },
        "part_count": len(parts),
        "shoulder_part_count": sum(1 for p in parts if str(p.get("id", "")).startswith("part.shoulder.")),
        "interface_completeness": {
            "ports": len(ports),
            "ports_with_interface": iface_complete,
            "interfaces": len(interfaces),
        },
        "features": len(features),
        "fastener_groups": len(fasteners),
        "fit_relations": len(fits),
        "assembly_plans": len(plan),
        "brep": {
            "kernel": manifest.get("kernel"),
            "build123d": manifest.get("build123d"),
            "parts_written": len(manifest.get("parts") or []),
            "exact_count": len(exact),
            "failures": failed,
            "ok": manifest.get("ok"),
        },
        "visual_component_coverage": {
            "shoulder_stl_files": len(stl),
        },
        "note": "Validation error counts come from `cargo test -p archeon-validation` / API validate. This runner does not invent a score.",
    }
    out = ROOT / "benchmarks" / "results" / "v0.5.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
