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


def write_tube_stl(path: str, inner_r: float, outer_r: float, height: float, segments: int = 36) -> None:
    hz = height / 2
    Path(path).parent.mkdir(parents=True, exist_ok=True)

    def ring(r, z):
        return [
            (r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z)
            for i in range(segments)
        ]

    ob, ot = ring(outer_r, -hz), ring(outer_r, hz)
    ib, it = ring(inner_r, -hz), ring(inner_r, hz)
    with open(path, "w", encoding="ascii") as f:
        f.write("solid archeon_tube\n")
        for i in range(segments):
            j = (i + 1) % segments
            no = (math.cos(2 * math.pi * i / segments), math.sin(2 * math.pi * i / segments), 0.0)
            ni = (-no[0], -no[1], 0.0)
            _tri(f, no, ob[i], ob[j], ot[j])
            _tri(f, no, ob[i], ot[j], ot[i])
            _tri(f, ni, ib[j], ib[i], it[i])
            _tri(f, ni, ib[j], it[i], it[j])
            _tri(f, (0, 0, 1), ot[i], ot[j], it[j])
            _tri(f, (0, 0, 1), ot[i], it[j], it[i])
            _tri(f, (0, 0, -1), ob[j], ob[i], ib[i])
            _tri(f, (0, 0, -1), ob[j], ib[i], ib[j])
        f.write("endsolid archeon_tube\n")


def write_stepped_shaft_stl(path: str, steps: list[tuple[float, float]], segments: int = 32) -> None:
    """steps: list of (radius, height) along +Z, centered as a group. PREVIEW tessellation."""
    total = sum(h for _, h in steps)
    z0 = -total / 2
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="ascii") as f:
        f.write("solid archeon_stepped\n")
        z = z0
        for radius, height in steps:
            hz0, hz1 = z, z + height
            ring_b, ring_t = [], []
            for i in range(segments):
                a = 2 * math.pi * i / segments
                x, y = radius * math.cos(a), radius * math.sin(a)
                ring_b.append((x, y, hz0))
                ring_t.append((x, y, hz1))
            bot, top = (0, 0, hz0), (0, 0, hz1)
            for i in range(segments):
                j = (i + 1) % segments
                _tri(f, (0, 0, -1), bot, ring_b[j], ring_b[i])
                _tri(f, (0, 0, 1), top, ring_t[i], ring_t[j])
                n = (math.cos(2 * math.pi * i / segments), math.sin(2 * math.pi * i / segments), 0.0)
                _tri(f, n, ring_b[i], ring_b[j], ring_t[j])
                _tri(f, n, ring_b[i], ring_t[j], ring_t[i])
            z = hz1
        f.write("endsolid archeon_stepped\n")


def write_box_with_y_hole_stl(
    path: str, sx: float, sy: float, sz: float, hole_r: float, segments: int = 28
) -> None:
    """PREVIEW tessellation: box envelope with a cylindrical through-hole along local Y.
    Not a Boolean BREP. Used only when OpenCascade is unavailable.
    """
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    # Approximate: outer box + inner cylindrical wall. Caps of the hole punch the ±Y faces.
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
    with open(path, "w", encoding="ascii") as f:
        f.write("solid archeon_box_hole\n")
        for n, a, b, c in faces:
            _tri(f, n, v[a], v[b], v[c])
        # ±Y faces as rings around the hole
        def yring(y):
            return [
                (
                    hole_r * math.cos(2 * math.pi * i / segments),
                    y,
                    hole_r * math.sin(2 * math.pi * i / segments),
                )
                for i in range(segments)
            ]

        r0, r1 = yring(-hy), yring(hy)
        # outer rectangles of ±Y faces are omitted (would require a 2D boolean). Draw hole wall only.
        for i in range(segments):
            j = (i + 1) % segments
            n = (
                math.cos(2 * math.pi * i / segments),
                0.0,
                math.sin(2 * math.pi * i / segments),
            )
            ni = (-n[0], 0.0, -n[2])
            _tri(f, ni, r0[i], r0[j], r1[j])
            _tri(f, ni, r0[i], r1[j], r1[i])
        f.write("endsolid archeon_box_hole\n")


def write_box_with_axis_hole_stl(
    path: str,
    sx: float,
    sy: float,
    sz: float,
    hole_r: float,
    axis: tuple[float, float, float] = (0.0, 0.0, 1.0),
    origin: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segments: int = 28,
) -> None:
    """PREVIEW hole wall using the explicit FeatureFrame axis and origin.

    The outer envelope remains a box. This is deliberately not called a
    Boolean BREP; the exact cut is delegated to the OCCT adapter.
    """
    ax, ay, az = axis
    mag = math.sqrt(ax * ax + ay * ay + az * az)
    if mag <= 1e-12:
        raise ValueError("feature axis must be non-zero")
    w = (ax / mag, ay / mag, az / mag)
    helper = (1.0, 0.0, 0.0) if abs(w[0]) < 0.9 else (0.0, 1.0, 0.0)
    ux = helper[1] * w[2] - helper[2] * w[1]
    uy = helper[2] * w[0] - helper[0] * w[2]
    uz = helper[0] * w[1] - helper[1] * w[0]
    um = math.sqrt(ux * ux + uy * uy + uz * uz)
    u = (ux / um, uy / um, uz / um)
    v = (
        w[1] * u[2] - w[2] * u[1],
        w[2] * u[0] - w[0] * u[2],
        w[0] * u[1] - w[1] * u[0],
    )
    length = abs(w[0]) * sx + abs(w[1]) * sy + abs(w[2]) * sz
    half = length * 0.6

    def ring(offset: float):
        points = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            radial = tuple(
                hole_r * (u[j] * math.cos(angle) + v[j] * math.sin(angle)) for j in range(3)
            )
            points.append(tuple(origin[j] + w[j] * offset + radial[j] for j in range(3)))
        return points

    # Start with the normal box mesh, then append the oriented inner wall.
    write_box_stl(path, sx, sy, sz)
    original = Path(path).read_text(encoding="ascii").splitlines()
    if original and original[-1].startswith("endsolid"):
        original.pop()
    r0, r1 = ring(-half), ring(half)
    with open(path, "w", encoding="ascii") as f:
        f.write("\n".join(original) + "\n")
        for i in range(segments):
            j = (i + 1) % segments
            angle = 2 * math.pi * i / segments
            normal = tuple(-(u[k] * math.cos(angle) + v[k] * math.sin(angle)) for k in range(3))
            _tri(f, normal, r0[i], r0[j], r1[j])
            _tri(f, normal, r0[i], r1[j], r1[i])
        f.write("endsolid archeon_box_axis_hole\n")


def write_fastener_stl(path: str, shank_r: float, shank_h: float, head_r: float, head_h: float) -> None:
    write_stepped_shaft_stl(path, [(head_r, head_h), (shank_r, shank_h)])
