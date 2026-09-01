"""CadKernelAdapter protocol and implementations."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol

from . import step_writer, stl_writer


def try_build123d() -> bool:
    try:
        import build123d  # noqa: F401

        return True
    except Exception:
        return False


class CadKernelAdapter(Protocol):
    name: str

    def regenerate(self, document: dict, out_dir: Path) -> dict: ...


class PrimitiveKernelAdapter:
    name = "primitive"

    def regenerate(self, document: dict, out_dir: Path) -> dict:
        out_dir.mkdir(parents=True, exist_ok=True)
        parts = document.get("parts") or []
        written = []
        bbox_union = [0.0, 0.0, 0.0]
        for part in parts:
            pid = part["id"]
            prim = part.get("spatial", {}).get("primitive", {})
            kind = prim.get("kind")
            stem = out_dir / pid.replace(".", "_")
            if kind == "box":
                sx, sy, sz = float(prim["sx"]), float(prim["sy"]), float(prim["sz"])
                step_writer.write_box_step(str(stem) + ".step", sx, sy, sz, pid)
                stl_writer.write_box_stl(str(stem) + ".stl", sx, sy, sz)
                bb = [sx, sy, sz]
            elif kind == "cylinder":
                r, h = float(prim["radius"]), float(prim["height"])
                step_writer.write_cylinder_step(str(stem) + ".step", r, h, pid)
                stl_writer.write_cylinder_stl(str(stem) + ".stl", r, h)
                bb = [r * 2, r * 2, h]
            else:
                continue
            vol = _volume(prim)
            dens = _density_for(document, part)
            mass = vol * dens if dens is not None else None
            written.append(
                {
                    "id": pid,
                    "step": str(stem) + ".step",
                    "stl": str(stem) + ".stl",
                    "bbox_m": bb,
                    "volume_m3": vol,
                    "mass_kg": mass,
                    "mass_class": "ASSUMED" if mass is not None else "UNVERIFIED",
                    "kernel": self.name,
                    "exact": True,
                    "note": "Exact primitive B-rep (box/cylinder). Not an OCCT feature tree.",
                }
            )
            for i in range(3):
                bbox_union[i] = max(bbox_union[i], bb[i])
        manifest = {
            "ok": True,
            "kernel": self.name,
            "build123d": False,
            "parts": written,
            "bbox_union_m": bbox_union,
            "interference": {
                "method": "none",
                "checked": False,
                "note": "No Boolean interference performed. Do not report collision-free.",
            },
        }
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest


class Build123dKernelAdapter:
    name = "build123d"

    def regenerate(self, document: dict, out_dir: Path) -> dict:
        if not try_build123d():
            raise RuntimeError("build123d is not installed")
        from build123d import Box, Cylinder, Location, Compound, export_step, export_stl  # type: ignore

        out_dir.mkdir(parents=True, exist_ok=True)
        solids = []
        written = []
        for part in document.get("parts") or []:
            pid = part["id"]
            spatial = part.get("spatial") or {}
            prim = spatial.get("primitive") or {}
            origin = spatial.get("origin_m") or [0, 0, 0]
            loc = Location((float(origin[0]), float(origin[1]), float(origin[2])))
            kind = prim.get("kind")
            if kind == "box":
                solid = loc * Box(float(prim["sx"]), float(prim["sy"]), float(prim["sz"]))
            elif kind == "cylinder":
                solid = loc * Cylinder(float(prim["radius"]), float(prim["height"]))
            else:
                continue
            solids.append(solid)
            stem = out_dir / (pid.replace(".", "_") + "_occt")
            export_step(solid, str(stem) + ".step")
            export_stl(solid, str(stem) + ".stl")
            written.append({"id": pid, "step": str(stem) + ".step", "stl": str(stem) + ".stl", "kernel": self.name})
        if solids:
            compound = Compound(solids)
            export_step(compound, str(out_dir / "assembly.step"))
        return {
            "ok": True,
            "kernel": self.name,
            "build123d": True,
            "parts": written,
            "interference": {
                "method": "not_run",
                "checked": False,
                "note": "Solids exported via OpenCascade. Boolean interference not invoked in Phase 1.",
            },
        }


def _volume(prim: dict) -> float:
    if prim.get("kind") == "box":
        return abs(float(prim["sx"]) * float(prim["sy"]) * float(prim["sz"]))
    if prim.get("kind") == "cylinder":
        import math

        return math.pi * float(prim["radius"]) ** 2 * float(prim["height"])
    return 0.0


def _density_for(document: dict, part: dict) -> float | None:
    mid = part.get("material")
    for m in document.get("materials") or []:
        if m.get("id") == mid:
            return m.get("density_kg_m3")
    return None


def select_kernel(prefer: str | None = None) -> CadKernelAdapter:
    if prefer == "build123d" or (prefer is None and try_build123d()):
        if try_build123d():
            return Build123dKernelAdapter()
    return PrimitiveKernelAdapter()
