from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .kernel import PrimitiveKernelAdapter, select_kernel, try_build123d


def _load_project(project: Path) -> dict:
    """Flatten canonical JSON directory into one document dict."""
    doc: dict = {}
    project_file = json.loads((project / "project.json").read_text(encoding="utf-8"))
    doc["project"] = project_file
    for name, keys in [
        ("parts.json", ("parts",)),
        ("assemblies.json", ("assemblies", "systems")),
        ("interfaces.json", ("interfaces", "ports", "mates")),
        ("joints.json", ("joints",)),
        ("features.json", ("features", "datums", "constraints")),
        ("materials.json", ("materials", "loads", "functions")),
        ("parameters.json", ("parameters",)),
        ("requirements.json", ("requirements",)),
        ("provenance.json", ("analyses", "evidence", "decisions", "revisions")),
        ("fasteners.json", ("fastener_groups",)),
        ("assembly_plan.json", ("assembly_plans",)),
        ("fits.json", ("fit_relations",)),
    ]:
        p = project / name
        if not p.exists():
            continue
        blob = json.loads(p.read_text(encoding="utf-8"))
        for k in keys:
            if k in blob:
                doc[k] = blob[k]
    return doc


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="archeon_cad")
    p.add_argument("command", choices=["ping", "regenerate", "export"])
    p.add_argument("--project", type=Path, default=None)
    p.add_argument("--json", action="store_true")
    p.add_argument("--kernel", default=None)
    p.add_argument("--part", default=None)
    p.add_argument("--format", default="step")
    args = p.parse_args(argv)

    if args.command == "ping":
        payload = {
            "ok": True,
            "kernel": "build123d" if try_build123d() else "primitive",
            "build123d": try_build123d(),
            "note": "Primitive STEP/STL always available. build123d used only if import succeeds.",
        }
        print(json.dumps(payload) if args.json else payload)
        return 0

    if args.command == "regenerate":
        if not args.project:
            print(" --project required", file=sys.stderr)
            return 2
        doc = _load_project(args.project)
        out = args.project / "generated"
        kernel = select_kernel(args.kernel)
        try:
            result = kernel.regenerate(doc, out)
        except Exception as exc:  # noqa: BLE001 — worker must fail closed
            if isinstance(kernel, PrimitiveKernelAdapter) is False:
                result = PrimitiveKernelAdapter().regenerate(doc, out)
                result["fallback"] = str(exc)
            else:
                print(json.dumps({"ok": False, "error": str(exc)}))
                return 1
        print(json.dumps(result) if args.json else result)
        return 0 if result.get("ok") else 1

    print("export is performed as part of regenerate", file=sys.stderr)
    return 2
