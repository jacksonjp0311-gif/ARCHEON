"""STL tessellation of primitives. Tessellation is not DesignIR and not BREP."""
from __future__ import annotations
import math
from pathlib import Path


def _tri(f, n, a, b, c):
    f.write(f"facet normal {n[0]:.6e} {n[1]:.6e} {n[2]:.6e}\n")
    f.write("  outer loop\n")
    for p in (a, b, c):
        f.write(f"    vertex {p[0]:.6e} {p[1]:.6e} {p[2]:.6e}\n")
    f.write("  endloop\nendfacet\n")


def write_box_stl(path: str, sx: float, sy: float, sz: float) -> None:
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    v = [
        (-hx, -hy, -hz),
        (hx, -hy, -hz),
        (hx, hy, -hz),
        (-hx, hy, -hz),
        (-hx, -hy, hz),
        (hx, -hy, hz),
        (hx, hy, hz),
        (-hx, hy, hz),
    ]
    faces = [
        ((0, 0, -1), 0, 2, 1),
        ((0, 0, -1), 0, 3, 2),
        ((0, 0, 1), 4, 5, 6),
        ((0, 0, 1), 4, 6, 7),
        ((0, -1, 0), 0, 1, 5),
        ((0, -1, 0), 0, 5, 4),
        ((0, 1, 0), 3, 7, 6),
        ((0, 1, 0), 3, 6, 2),
        ((-1, 0, 0), 0, 4, 7),
        ((-1, 0, 0), 0, 7, 3),
        ((1, 0, 0), 1, 2, 6),
        ((1, 0, 0), 1, 6, 5),
    ]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="ascii") as f:
        f.write("solid archeon_box\n")
        for n, a, b, c in faces:
            _tri(f, n, v[a], v[b], v[c])
        f.write("endsolid archeon_box\n")


def write_cylinder_stl(path: str, radius: float, height: float, segments: int = 32) -> None:
    hz = height / 2
    ring_b = []
    ring_t = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        x, y = radius * math.cos(a), radius * math.sin(a)
        ring_b.append((x, y, -hz))
        ring_t.append((x, y, hz))
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="ascii") as f:
        f.write("solid archeon_cyl\n")
        bot, top = (0, 0, -hz), (0, 0, hz)
        for i in range(segments):
            j = (i + 1) % segments
            _tri(f, (0, 0, -1), bot, ring_b[j], ring_b[i])
            _tri(f, (0, 0, 1), top, ring_t[i], ring_t[j])
            n = (math.cos(2 * math.pi * i / segments), math.sin(2 * math.pi * i / segments), 0.0)
            _tri(f, n, ring_b[i], ring_b[j], ring_t[j])
            _tri(f, n, ring_b[i], ring_t[j], ring_t[i])
        f.write("endsolid archeon_cyl\n")
