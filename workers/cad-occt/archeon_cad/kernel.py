"""CadKernelAdapter protocol and implementations.

DesignIR features drive solids. Three.js primitives are a viewport fallback envelope,
not the primary generated design path.

Kernel geometry claims (honest):

  EXACT primitive STEP+STL always:
    box, cylinder, extrude-as-box, revolve-as-cylinder, tube (bearing bore / spacer)

  OCCT (build123d) when installed:
    hole, pocket, cut, bearing_seat, cable_passage, fillet, chamfer,
    pattern (polar instances), boolean union/cut

  PREVIEW tessellation when OCCT is missing:
    box with cylindrical hole (STL only; STEP remains the envelope)
    stepped shaft (STL stacked cylinders; STEP is journal envelope)

  SEMANTIC only (stored, not authored):
    slot, boss, rib, shell, thread/thread_reference, keyway, datum, sketch
"""
from __future__ import annotations

import json
import hashlib
import math
from pathlib import Path
from typing import Any, Protocol

from . import step_writer, stl_writer

CAD_COVERAGE = {
    "box": "exact_primitive",
    "cylinder": "exact_primitive",
    "extrude": "exact_primitive",
    "revolve": "exact_primitive",
    "tube": "exact_primitive",
    "hole": "occt_or_preview",
    "cut": "occt_or_preview",
    "pocket": "occt_or_preview",
    "bearing_seat": "occt_or_preview",
    "cable_passage": "occt_or_preview",
    "shaft_step": "occt_or_preview",
    "fillet": "occt_or_semantic",
    "chamfer": "occt_or_semantic",
    "counterbore": "occt_or_preview",
    "countersink": "occt_or_preview",
    "pattern": "occt_or_instances",
    "boolean_union": "occt_only",
    "boolean_cut": "occt_only",
    "slot": "semantic_only",
    "boss": "semantic_only",
    "rib": "semantic_only",
    "shell": "semantic_only",
    "thread": "semantic_only",
    "thread_reference": "semantic_only",
    "mount_pattern": "occt_or_instances",
    "flange": "occt_or_preview",
    "keyway": "semantic_only",
}


def try_build123d() -> bool:
    try:
        import build123d  # noqa: F401

        return True
    except Exception:
        return False


class CadKernelAdapter(Protocol):
    name: str

    def regenerate(self, document: dict, out_dir: Path) -> dict: ...


def _features_for(document: dict, part_id: str) -> list[dict]:
    return [f for f in (document.get("features") or []) if f.get("part") == part_id]


def _fnum(feat: dict, *keys: str, default: float | None = None) -> float | None:
    params = feat.get("params") or {}
    for k in keys:
        if k in params and params[k] is not None:
            try:
                return float(params[k])
            except (TypeError, ValueError):
                continue
    return default


def _has_kind(feats: list[dict], *kinds: str) -> list[dict]:
    want = set(kinds)
    return [f for f in feats if f.get("kind") in want]


def _feature_frame(feature: dict) -> dict:
    """Return a normalized ARCHEON local frame (RH, Z-up, X-forward, meters)."""
    frame = feature.get("frame") or {}
    origin = tuple(float(v) for v in frame.get("origin_m", (0.0, 0.0, 0.0)))
    rpy = tuple(float(v) for v in frame.get("rpy_rad", (0.0, 0.0, 0.0)))
    raw_axis = tuple(float(v) for v in frame.get("axis", (0.0, 0.0, 1.0)))
    roll, pitch, yaw = rpy
    cr, sr = math.cos(roll), math.sin(roll)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cy, sy = math.cos(yaw), math.sin(yaw)
    # Rz(yaw) * Ry(pitch) * Rx(roll), shared by preview and OCCT.
    x, y, z = raw_axis
    raw_axis = (
        cy * cp * x + (cy * sp * sr - sy * cr) * y + (cy * sp * cr + sy * sr) * z,
        sy * cp * x + (sy * sp * sr + cy * cr) * y + (sy * sp * cr - cy * sr) * z,
        -sp * x + cp * sr * y + cp * cr * z,
    )
    mag = math.sqrt(sum(v * v for v in raw_axis))
    if mag <= 1e-12:
        raise ValueError(f"feature {feature.get('id', '<unknown>')} has a zero axis")
    axis = tuple(v / mag for v in raw_axis)
    return {
        "host": frame.get("host") or feature.get("part"),
        "datum_id": frame.get("datum_id"),
        "origin_m": origin,
        "rpy_rad": rpy,
        "axis": axis,
        "coordinate_system": "RIGHT_HANDED_Z_UP_X_FORWARD_METERS",
    }


def _sha256_files(*paths: str) -> str:
    digest = hashlib.sha256()
    for path in paths:
        with open(path, "rb") as source:
            for chunk in iter(lambda: source.read(65536), b""):
                digest.update(chunk)
    return digest.hexdigest()


def _volume(prim: dict) -> float:
    kind = prim.get("kind")
    if kind == "box":
        return abs(float(prim["sx"]) * float(prim["sy"]) * float(prim["sz"]))
    if kind == "cylinder":
        return math.pi * float(prim["radius"]) ** 2 * float(prim["height"])
    return 0.0


def _density_for(document: dict, part: dict) -> float | None:
    mid = part.get("material")
    for m in document.get("materials") or []:
        if m.get("id") == mid:
            return m.get("density_kg_m3")
    return None


def _inner_radius(feats: list[dict], prim: dict) -> float | None:
    for f in _has_kind(feats, "bearing_seat", "hole", "pocket", "cable_passage", "cut"):
        d = _fnum(f, "diameter_m", "bearing_od_m")
        if d:
            return d / 2.0
        r = _fnum(f, "radius_m", "inner_r_m")
        if r:
            return r
    if prim.get("kind") == "cylinder":
        inner = None
        for f in feats:
            ir = _fnum(f, "inner_r_m")
            if ir:
                inner = ir
        return inner
    return None


def _flange_stack(feats: list[dict], prim: dict) -> list[tuple[float, float]] | None:
    flanges = _has_kind(feats, "flange")
    if not flanges or prim.get("kind") != "cylinder":
        return None
    r, h = float(prim["radius"]), float(prim["height"])
    disks: list[tuple[float, float]] = []
    for f in flanges:
        od = _fnum(f, "od_m") or (r * 2.0 * 1.32)
        th = _fnum(f, "thickness_m") or 0.006
        disks.append((od / 2.0, th))
    body_h = max(0.004, h - sum(t for _, t in disks))
    if len(disks) == 1:
        return [disks[0], (r, body_h)]
    return [disks[0], (r, body_h), disks[-1]]


def _shaft_steps(feats: list[dict], prim: dict) -> list[tuple[float, float]] | None:
    steps = _has_kind(feats, "shaft_step")
    if not steps:
        return None
    out: list[tuple[float, float]] = []
    if prim.get("kind") == "cylinder":
        out.append((float(prim["radius"]), float(prim["height"]) * 0.55))
    for f in steps:
        d = _fnum(f, "diameter_m", default=0.024) or 0.024
        L = _fnum(f, "length_m", default=0.008) or 0.008
        out.append((d / 2.0, L))
    return out


def _write_primitive(stem: Path, part: dict, feats: list[dict]) -> dict:
    prim = part.get("spatial", {}).get("primitive", {})
    kind = prim.get("kind")
    pid = part["id"]
    frame_failures: list[str] = []
    valid_features: list[dict] = []
    for feature in feats:
        try:
            frame = _feature_frame(feature)
            if frame["host"] != pid:
                raise ValueError(f"frame host {frame['host']} does not match {pid}")
            valid_features.append(feature)
        except (TypeError, ValueError) as error:
            frame_failures.append(f"{feature.get('id', feature.get('kind'))}:{error}")
    feats = valid_features
    report_features = list(feats)
    if kind == "cylinder":
        # The dependency-free STEP writer can only author coaxial local-Z
        # features. Other frames remain explicit UNSUPPORTED, never fabricated.
        feats = [
            feature
            for feature in feats
            if max(abs(value) for value in _feature_frame(feature)["origin_m"]) < 1e-12
            and abs(_feature_frame(feature)["axis"][0]) < 1e-9
            and abs(_feature_frame(feature)["axis"][1]) < 1e-9
            and abs(abs(_feature_frame(feature)["axis"][2]) - 1.0) < 1e-9
        ]
    inner = _inner_radius(feats, prim)
    cls = (part.get("component_class") or "") + (part.get("catalog_ref") or "")
    if inner is None and ("bearing" in cls.lower() or "6204" in cls):
        inner = 0.010
    if inner is None and "retainer" in (part.get("semantic_role") or ""):
        inner = max(0.002, float(prim.get("radius", 0.02)) - 0.006)
    steps = _shaft_steps(feats, prim)
    flanges = _flange_stack(feats, prim)
    holes = _has_kind(feats, "hole", "bearing_seat", "pocket", "cable_passage", "cut", "counterbore")
    applied: list[str] = []
    failed: list[str] = frame_failures
    exact = True
    note = "Exact primitive B-rep."
    bb = [0.01, 0.01, 0.01]

    if kind == "cylinder" and inner and inner < float(prim["radius"]):
        r, h = float(prim["radius"]), float(prim["height"])
        step_writer.write_tube_step(str(stem) + ".step", inner, r, h, pid)
        stl_writer.write_tube_stl(str(stem) + ".stl", inner, r, h)
        bb = [r * 2, r * 2, h]
        applied.append("tube")
        note = "Exact hollow-cylinder B-rep (bearing bore / spacer analog)."
    elif kind == "cylinder" and flanges:
        r, h = float(prim["radius"]), float(prim["height"])
        step_writer.write_cylinder_step(str(stem) + ".step", r, h, pid)
        stl_writer.write_stepped_shaft_stl(str(stem) + ".stl", flanges)
        bb = [max(x[0] for x in flanges) * 2, max(x[0] for x in flanges) * 2, h]
        applied.append("flange_preview")
        exact = False
        note = "STEP is the cylinder envelope (exact). STL is a PREVIEW of housing/motor flanges. Fused OCCT solid requires build123d."
    elif kind == "cylinder" and steps:
        r, h = float(prim["radius"]), float(prim["height"])
        step_writer.write_cylinder_step(str(stem) + ".step", r, h, pid)
        stl_writer.write_stepped_shaft_stl(str(stem) + ".stl", steps)
        bb = [r * 2, r * 2, h]
        applied.append("shaft_step_preview")
        exact = False
        note = "STEP is the journal envelope (exact cylinder). STL is a PREVIEW of shaft steps. Not a fused OCCT solid."
    elif kind == "box" and holes:
        sx, sy, sz = float(prim["sx"]), float(prim["sy"]), float(prim["sz"])
        hole_r = inner or (_fnum(holes[0], "diameter_m", "bearing_od_m", default=0.047) or 0.047) / 2.0
        step_writer.write_box_step(str(stem) + ".step", sx, sy, sz, pid)
        frame = _feature_frame(holes[0])
        stl_writer.write_box_with_axis_hole_stl(
            str(stem) + ".stl",
            sx,
            sy,
            sz,
            hole_r,
            frame["axis"],
            frame["origin_m"],
        )
        bb = [sx, sy, sz]
        applied.extend(f.get("kind") for f in holes)
        exact = False
        note = "STEP is the exact box envelope. STL PREVIEW uses the declared FeatureFrame axis/origin. Boolean cut requires build123d/OCCT."
    elif kind == "box":
        sx, sy, sz = float(prim["sx"]), float(prim["sy"]), float(prim["sz"])
        step_writer.write_box_step(str(stem) + ".step", sx, sy, sz, pid)
        stl_writer.write_box_stl(str(stem) + ".stl", sx, sy, sz)
        bb = [sx, sy, sz]
        applied.append("box")
        note = "Exact primitive B-rep (box). Not an OCCT feature tree."
    elif kind == "cylinder":
        r, h = float(prim["radius"]), float(prim["height"])
        # fastener visual: head + shank as preview if role says bolt
        role = (part.get("semantic_role") or "") + (part.get("component_class") or "")
        if "bolt" in role or "fastener" in role:
            head_r = r * 1.6
            head_h = h * 0.28
            shank_h = h * 0.72
            step_writer.write_cylinder_step(str(stem) + ".step", r, h, pid)
            stl_writer.write_fastener_stl(str(stem) + ".stl", r, shank_h, head_r, head_h)
            exact = False
            note = "STEP is a cylinder envelope (exact). STL is a cosmetic cap-head PREVIEW. Thread is THREAD_REFERENCE — not helix BREP."
        else:
            step_writer.write_cylinder_step(str(stem) + ".step", r, h, pid)
            stl_writer.write_cylinder_stl(str(stem) + ".stl", r, h)
            note = "Exact primitive B-rep (cylinder). Not an OCCT feature tree."
        bb = [r * 2, r * 2, h]
        applied.append("cylinder")
    else:
        return {}

    applied_kinds = set(applied)
    applied_features = [
        f.get("id", f.get("kind"))
        for f in feats
        if f.get("kind") in applied_kinds
        or ("tube" in applied_kinds and f.get("kind") in {"bearing_seat", "hole", "pocket", "cut"})
        or ("flange_preview" in applied_kinds and f.get("kind") == "flange")
        or ("shaft_step_preview" in applied_kinds and f.get("kind") == "shaft_step")
    ]
    unsupported = [
        f.get("id", f.get("kind"))
        for f in report_features
        if f.get("id", f.get("kind")) not in applied_features
    ]
    return {
        "bbox_m": bb,
        "applied": [k for k in applied_features if k],
        "semantic_only": unsupported,
        "unsupported": unsupported,
        "failed": failed,
        "exact": exact,
        "note": note,
        "volume_m3": _volume(prim),
    }


def _write_build123d(stem: Path, part: dict, feats: list[dict]) -> dict | None:
    try:
        from build123d import (  # type: ignore
            Box,
            Cone,
            Cylinder,
            Location,
            Plane,
            export_step,
            export_stl,
            fillet as occt_fillet,
            chamfer as occt_chamfer,
        )
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}

    spatial = part.get("spatial") or {}
    prim = spatial.get("primitive") or {}
    origin = spatial.get("origin_m") or [0, 0, 0]
    loc = Location((0.0, 0.0, 0.0))  # assembly placement stays in DesignIR
    kind = prim.get("kind")
    applied: list[str] = []
    failed: list[str] = []
    try:
        if kind == "box":
            solid = loc * Box(float(prim["sx"]), float(prim["sy"]), float(prim["sz"]))
            applied.append("box")
        elif kind == "cylinder":
            solid = loc * Cylinder(float(prim["radius"]), float(prim["height"]))
            applied.append("cylinder")
        else:
            return None
        for f in feats:
            fk = f.get("kind")
            fid = f.get("id", fk)
            try:
                if fk in ("hole", "cut", "pocket", "bearing_seat", "cable_passage", "counterbore", "countersink"):
                    r = _fnum(f, "radius_m") or ((_fnum(f, "diameter_m", "bearing_od_m") or 0.01) / 2.0)
                    depth = _fnum(f, "depth_m", "height_m") or (
                        float(prim["sy"]) if kind == "box" else float(prim.get("height", 0.02))
                    )
                    frame = _feature_frame(f)
                    cutter_origin = tuple(
                        frame["origin_m"][i] - frame["axis"][i] * depth * 0.6 for i in range(3)
                    )
                    plane = Plane(origin=cutter_origin, z_dir=frame["axis"])
                    cutter = plane * Cylinder(r, depth * 1.2)
                    if fk == "counterbore":
                        head_r = (_fnum(f, "counterbore_diameter_m", "head_diameter_m") or (r * 3.0)) / 2.0
                        head_depth = _fnum(f, "counterbore_depth_m", default=depth * 0.25) or depth * 0.25
                        cutter = cutter + plane * Cylinder(head_r, head_depth)
                    elif fk == "countersink":
                        head_r = (_fnum(f, "countersink_diameter_m", "head_diameter_m") or (r * 3.0)) / 2.0
                        sink_depth = _fnum(f, "countersink_depth_m", default=head_r) or head_r
                        cutter = cutter + plane * Cone(head_r, r, sink_depth)
                    solid = solid - cutter
                    applied.append(fid)
                elif fk == "fillet":
                    rad = _fnum(f, "radius_m", default=0.001) or 0.001
                    solid = occt_fillet(solid.edges(), rad)
                    applied.append(fid)
                elif fk == "chamfer":
                    dist = _fnum(f, "distance_m", default=0.001) or 0.001
                    solid = occt_chamfer(solid.edges(), dist)
                    applied.append(fid)
                elif fk == "shaft_step":
                    d = _fnum(f, "diameter_m", default=0.024) or 0.024
                    L = _fnum(f, "length_m", default=0.008) or 0.008
                    frame = _feature_frame(f)
                    step = Plane(origin=frame["origin_m"], z_dir=frame["axis"]) * Cylinder(d / 2.0, L)
                    solid = solid + step
                    applied.append(fid)
                elif fk == "flange":
                    frame = _feature_frame(f)
                    od = _fnum(f, "od_m", "diameter_m") or float(prim.get("radius", 0.02)) * 2.6
                    thickness = _fnum(f, "thickness_m", "depth_m", default=0.006) or 0.006
                    flange = Plane(origin=frame["origin_m"], z_dir=frame["axis"]) * Cylinder(
                        od / 2.0, thickness
                    )
                    solid = solid + flange
                    applied.append(fid)
                elif fk in ("pattern", "mount_pattern"):
                    count = int(_fnum(f, "count", default=0) or 0)
                    circle = _fnum(f, "bolt_circle_m", "pitch_circle_m") or 0.0
                    diameter = _fnum(f, "diameter_m", "hole_diameter_m") or 0.0
                    if count < 1 or circle <= 0 or diameter <= 0:
                        raise ValueError("pattern needs positive count, bolt_circle_m, and diameter_m")
                    frame = _feature_frame(f)
                    axis = frame["axis"]
                    helper = (1.0, 0.0, 0.0) if abs(axis[0]) < 0.9 else (0.0, 1.0, 0.0)
                    u = (
                        helper[1] * axis[2] - helper[2] * axis[1],
                        helper[2] * axis[0] - helper[0] * axis[2],
                        helper[0] * axis[1] - helper[1] * axis[0],
                    )
                    um = math.sqrt(sum(value * value for value in u))
                    u = tuple(value / um for value in u)
                    v = (
                        axis[1] * u[2] - axis[2] * u[1],
                        axis[2] * u[0] - axis[0] * u[2],
                        axis[0] * u[1] - axis[1] * u[0],
                    )
                    depth = _fnum(f, "depth_m", default=max(prim.get("sx", 0), prim.get("sy", 0), prim.get("sz", 0), prim.get("height", 0.02))) or 0.02
                    for index in range(count):
                        angle = 2.0 * math.pi * index / count
                        center = tuple(
                            frame["origin_m"][i]
                            + circle * 0.5 * (u[i] * math.cos(angle) + v[i] * math.sin(angle))
                            for i in range(3)
                        )
                        cutter = Plane(origin=center, z_dir=axis) * Cylinder(diameter / 2.0, depth * 1.2)
                        solid = solid - cutter
                    applied.append(fid)
            except Exception as exc:  # noqa: BLE001
                failed.append(f"{fk}:{exc}")
        export_step(solid, str(stem) + ".step")
        export_stl(solid, str(stem) + ".stl")
        bounds = solid.bounding_box()
        bb = [float(bounds.size.X), float(bounds.size.Y), float(bounds.size.Z)]
        return {
            "bbox_m": bb,
            "applied": applied,
            "failed": failed,
            "unsupported": [
                f.get("id", f.get("kind"))
                for f in feats
                if f.get("id", f.get("kind")) not in applied
            ],
            "exact": True,
            "note": "OpenCascade/build123d solid. Fillet/chamfer/hole applied when the feature succeeded.",
            "volume_m3": float(solid.volume),
            "kernel": "build123d",
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


class PrimitiveKernelAdapter:
    name = "primitive"

    def regenerate(self, document: dict, out_dir: Path) -> dict:
        out_dir.mkdir(parents=True, exist_ok=True)
        written = []
        bbox_union = [0.0, 0.0, 0.0]
        failures = []
        for part in document.get("parts") or []:
            pid = part["id"]
            stem = out_dir / pid.replace(".", "_")
            feats = _features_for(document, pid)
            spec = _write_primitive(stem, part, feats)
            if not spec:
                failures.append({"id": pid, "error": "unsupported primitive"})
                continue
            dens = _density_for(document, part)
            vol = spec.get("volume_m3")
            mass = vol * dens if dens is not None and vol is not None else None
            written.append(
                {
                    "id": pid,
                    "step": str(stem) + ".step",
                    "stl": str(stem) + ".stl",
                    "bbox_m": spec["bbox_m"],
                    "volume_m3": vol,
                    "mass_kg": mass,
                    "mass_class": "ASSUMED" if mass is not None else "UNVERIFIED",
                    "kernel": self.name,
                    "exact": spec.get("exact", True)
                    and not spec.get("failed")
                    and not spec.get("unsupported"),
                    "geometry_class": (
                        "GENERATED_EXACT"
                        if spec.get("exact", True)
                        and not spec.get("failed")
                        and not spec.get("unsupported")
                        else "GENERATED_PREVIEW"
                    ),
                    "applied_features": spec.get("applied", []),
                    "unsupported_features": spec.get("unsupported", []),
                    "semantic_only_features": spec.get("semantic_only", []),
                    "failed_features": spec.get("failed", []),
                    "note": spec.get("note"),
                    "geometry_hash": _sha256_files(str(stem) + ".step", str(stem) + ".stl"),
                    "geometry_revision": (document.get("project") or {}).get("revision_id", ""),
                }
            )
            for i in range(3):
                bbox_union[i] = max(bbox_union[i], spec["bbox_m"][i])
        manifest = {
            "ok": True,
            "kernel": self.name,
            "build123d": False,
            "coverage": CAD_COVERAGE,
            "parts": written,
            "failures": failures,
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
        out_dir.mkdir(parents=True, exist_ok=True)
        written = []
        failures = []
        bbox_union = [0.0, 0.0, 0.0]
        for part in document.get("parts") or []:
            pid = part["id"]
            stem = out_dir / pid.replace(".", "_")
            feats = _features_for(document, pid)
            spec = _write_build123d(stem, part, feats)
            if not spec or spec.get("error"):
                fallback = PrimitiveKernelAdapter()
                one = {"parts": [part], "features": feats, "materials": document.get("materials") or []}
                tmp = fallback.regenerate(one, out_dir)
                if tmp.get("parts"):
                    rec = tmp["parts"][0]
                    rec["fallback"] = spec.get("error") if spec else "build123d_failed"
                    rec["kernel"] = "primitive_fallback"
                    rec["geometry_class"] = "PRIMITIVE_FALLBACK"
                    written.append(rec)
                else:
                    failures.append({"id": pid, "error": spec.get("error") if spec else "unknown"})
                continue
            dens = _density_for(document, part)
            vol = spec.get("volume_m3")
            mass = vol * dens if dens is not None and vol is not None else None
            written.append(
                {
                    "id": pid,
                    "step": str(stem) + ".step",
                    "stl": str(stem) + ".stl",
                    "bbox_m": spec["bbox_m"],
                    "volume_m3": vol,
                    "mass_kg": mass,
                    "mass_class": "ASSUMED" if mass is not None else "UNVERIFIED",
                    "kernel": self.name,
                    "exact": spec.get("exact", True),
                    "geometry_class": (
                        "GENERATED_EXACT"
                        if not spec.get("failed") and not spec.get("unsupported")
                        else "GENERATED_PREVIEW"
                    ),
                    "applied_features": spec.get("applied", []),
                    "unsupported_features": spec.get("unsupported", []),
                    "failed_features": spec.get("failed", []),
                    "note": spec.get("note"),
                    "geometry_hash": _sha256_files(str(stem) + ".step", str(stem) + ".stl"),
                    "geometry_revision": (document.get("project") or {}).get("revision_id", ""),
                }
            )
            for i in range(3):
                bbox_union[i] = max(bbox_union[i], spec["bbox_m"][i])
        manifest = {
            "ok": True,
            "kernel": self.name,
            "build123d": True,
            "coverage": CAD_COVERAGE,
            "parts": written,
            "failures": failures,
            "bbox_union_m": bbox_union,
            "interference": {
                "method": "not_run",
                "checked": False,
                "note": "Solids exported via OpenCascade. Boolean interference not invoked unless a feature cut succeeded per-part.",
            },
        }
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest


def select_kernel(prefer: str | None = None) -> CadKernelAdapter:
    if prefer == "build123d" or (prefer is None and try_build123d()):
        if try_build123d():
            return Build123dKernelAdapter()
    return PrimitiveKernelAdapter()
