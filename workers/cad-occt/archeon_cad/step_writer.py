"""ISO-10303-21 writer for exact box and cylinder B-rep.

This is real STEP, not a mesh renamed as CAD. It is still a simplified
primitive kernel, not an OpenCascade feature tree.
"""
from __future__ import annotations


class _Ent:
    def __init__(self):
        self.n = 0
        self.lines: list[str] = []

    def add(self, body: str) -> str:
        self.n += 1
        name = f"#{self.n}"
        self.lines.append(f"{name}={body};")
        return name


def _header(name: str) -> str:
    return (
        "ISO-10303-21;\nHEADER;\n"
        "FILE_DESCRIPTION(('ARCHEON primitive B-rep'),'2;1');\n"
        f"FILE_NAME('{name}','2026-08-31T00:00:00',('ARCHEON'),('ARCHEON'),"
        "'ARCHEON PrimitiveKernelAdapter','ARCHEON','');\n"
        "FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\n"
        "ENDSEC;\nDATA;\n"
    )


def write_box_step(path: str, sx: float, sy: float, sz: float, name: str = "box") -> None:
    hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0
    e = _Ent()
    pts = {}
    for ix, x in enumerate((-hx, hx)):
        for iy, y in enumerate((-hy, hy)):
            for iz, z in enumerate((-hz, hz)):
                pts[(ix, iy, iz)] = e.add(f"CARTESIAN_POINT('',({x:.8f},{y:.8f},{z:.8f}))")

    def vertex(key):
        return e.add(f"VERTEX_POINT('',{pts[key]})")

    verts = {k: vertex(k) for k in pts}

    dx = e.add("DIRECTION('',(1.,0.,0.))")
    dy = e.add("DIRECTION('',(0.,1.,0.))")
    dz = e.add("DIRECTION('',(0.,0.,1.))")
    orig = e.add("CARTESIAN_POINT('',(0.,0.,0.))")
    ax = e.add(f"AXIS2_PLACEMENT_3D('',{orig},{dz},{dx})")

    def line(p, d):
        vec = e.add(f"VECTOR('',{d},1.)")
        return e.add(f"LINE('',{p},{vec})")

    def edge(v1, v2, p, d):
        crv = line(p, d)
        return e.add(f"EDGE_CURVE('',{v1},{v2},{crv},.T.)")

    # 12 edges of the box
    edges = {}
    # x-direction edges (y,z fixed)
    for iy in (0, 1):
        for iz in (0, 1):
            edges[("x", iy, iz)] = edge(verts[(0, iy, iz)], verts[(1, iy, iz)], pts[(0, iy, iz)], dx)
    for ix in (0, 1):
        for iz in (0, 1):
            edges[("y", ix, iz)] = edge(verts[(ix, 0, iz)], verts[(ix, 1, iz)], pts[(ix, 0, iz)], dy)
    for ix in (0, 1):
        for iy in (0, 1):
            edges[("z", ix, iy)] = edge(verts[(ix, iy, 0)], verts[(ix, iy, 1)], pts[(ix, iy, 0)], dz)

    def face(plane_dir, ori_pt, loop_edges):
        ori = e.add(f"AXIS2_PLACEMENT_3D('',{ori_pt},{plane_dir},{dx if plane_dir != dx else dy})")
        plane = e.add(f"PLANE('',{ori})")
        oes = [e.add(f"ORIENTED_EDGE('',*,*,{ed},.T.)") for ed in loop_edges]
        loop = e.add("EDGE_LOOP('',(" + ",".join(oes) + "))")
        bound = e.add(f"FACE_OUTER_BOUND('',{loop},.T.)")
        return e.add(f"ADVANCED_FACE('',({bound}),{plane},.T.)")

    faces = [
        face(dx, pts[(1, 0, 0)], [edges[("y", 1, 0)], edges[("z", 1, 1)], edges[("y", 1, 1)], edges[("z", 1, 0)]]),
        face(dx, pts[(0, 0, 0)], [edges[("y", 0, 0)], edges[("z", 0, 1)], edges[("y", 0, 1)], edges[("z", 0, 0)]]),
        face(dy, pts[(0, 1, 0)], [edges[("x", 1, 0)], edges[("z", 1, 1)], edges[("x", 1, 1)], edges[("z", 0, 1)]]),
        face(dy, pts[(0, 0, 0)], [edges[("x", 0, 0)], edges[("z", 1, 0)], edges[("x", 0, 1)], edges[("z", 0, 0)]]),
        face(dz, pts[(0, 0, 1)], [edges[("x", 0, 1)], edges[("y", 1, 1)], edges[("x", 1, 1)], edges[("y", 0, 1)]]),
        face(dz, pts[(0, 0, 0)], [edges[("x", 0, 0)], edges[("y", 1, 0)], edges[("x", 1, 0)], edges[("y", 0, 0)]]),
    ]
    shell = e.add("CLOSED_SHELL('',(" + ",".join(faces) + "))")
    solid = e.add(f"MANIFOLD_SOLID_BREP('{name}',{shell})")
    e.add(f"PRODUCT_DEFINITION_SHAPE('',$,{solid})")
    body = _header(name) + "\n".join(e.lines) + "\nENDSEC;\nEND-ISO-10303-21;\n"
    with open(path, "w", encoding="ascii") as f:
        f.write(body)


def write_cylinder_step(path: str, radius: float, height: float, name: str = "cyl") -> None:
    """Exact cylindrical B-rep: cylindrical surface + two planar caps."""
    e = _Ent()
    hz = height / 2.0
    p0 = e.add("CARTESIAN_POINT('',(0.,0.,0.))")
    dz = e.add("DIRECTION('',(0.,0.,1.))")
    dx = e.add("DIRECTION('',(1.,0.,0.))")
    ax = e.add(f"AXIS2_PLACEMENT_3D('',{p0},{dz},{dx})")
    cyl = e.add(f"CYLINDRICAL_SURFACE('',{ax},{radius:.8f})")

    def cap(z: float):
        pt = e.add(f"CARTESIAN_POINT('',(0.,0.,{z:.8f}))")
        loc = e.add(f"AXIS2_PLACEMENT_3D('',{pt},{dz},{dx})")
        plane = e.add(f"PLANE('',{loc})")
        circ = e.add(f"CIRCLE('',{loc},{radius:.8f})")
        # two vertices on the circle
        v1p = e.add(f"CARTESIAN_POINT('',({radius:.8f},0.,{z:.8f}))")
        v2p = e.add(f"CARTESIAN_POINT('',({-radius:.8f},0.,{z:.8f}))")
        v1 = e.add(f"VERTEX_POINT('',{v1p})")
        v2 = e.add(f"VERTEX_POINT('',{v2p})")
        e1 = e.add(f"EDGE_CURVE('',{v1},{v2},{circ},.T.)")
        e2 = e.add(f"EDGE_CURVE('',{v2},{v1},{circ},.T.)")
        oe1 = e.add(f"ORIENTED_EDGE('',*,*,{e1},.T.)")
        oe2 = e.add(f"ORIENTED_EDGE('',*,*,{e2},.T.)")
        loop = e.add(f"EDGE_LOOP('',({oe1},{oe2}))")
        bound = e.add(f"FACE_OUTER_BOUND('',{loop},.T.)")
        face = e.add(f"ADVANCED_FACE('',({bound}),{plane},.T.)")
        return face, e1, e2, v1, v2

    top, te1, te2, tv1, tv2 = cap(hz)
    bot, be1, be2, bv1, bv2 = cap(-hz)
    # cylindrical wall uses the same circular edges
    oe_wall = [
        e.add(f"ORIENTED_EDGE('',*,*,{te1},.T.)"),
        e.add(f"ORIENTED_EDGE('',*,*,{be1},.F.)"),
    ]
    loop_w = e.add("EDGE_LOOP('',(" + ",".join(oe_wall) + "))")
    bound_w = e.add(f"FACE_OUTER_BOUND('',{loop_w},.T.)")
    wall = e.add(f"ADVANCED_FACE('',({bound_w}),{cyl},.T.)")
    shell = e.add(f"CLOSED_SHELL('',({wall},{top},{bot}))")
    solid = e.add(f"MANIFOLD_SOLID_BREP('{name}',{shell})")
    e.add(f"PRODUCT_DEFINITION_SHAPE('',$,{solid})")
    body = _header(name) + "\n".join(e.lines) + "\nENDSEC;\nEND-ISO-10303-21;\n"
    with open(path, "w", encoding="ascii") as f:
        f.write(body)


def write_tube_step(
    path: str, inner_r: float, outer_r: float, height: float, name: str = "tube"
) -> None:
    """Exact hollow-cylinder B-rep: outer + inner cylindrical surfaces and two annular caps."""
    if inner_r >= outer_r or inner_r <= 0 or outer_r <= 0:
        raise ValueError("tube requires 0 < inner_r < outer_r")
    e = _Ent()
    hz = height / 2.0
    p0 = e.add("CARTESIAN_POINT('',(0.,0.,0.))")
    dz = e.add("DIRECTION('',(0.,0.,1.))")
    dx = e.add("DIRECTION('',(1.,0.,0.))")
    ax = e.add(f"AXIS2_PLACEMENT_3D('',{p0},{dz},{dx})")
    cyl_o = e.add(f"CYLINDRICAL_SURFACE('',{ax},{outer_r:.8f})")
    cyl_i = e.add(f"CYLINDRICAL_SURFACE('',{ax},{inner_r:.8f})")

    def ring(z: float, radius: float):
        pt = e.add(f"CARTESIAN_POINT('',(0.,0.,{z:.8f}))")
        loc = e.add(f"AXIS2_PLACEMENT_3D('',{pt},{dz},{dx})")
        circ = e.add(f"CIRCLE('',{loc},{radius:.8f})")
        v1p = e.add(f"CARTESIAN_POINT('',({radius:.8f},0.,{z:.8f}))")
        v2p = e.add(f"CARTESIAN_POINT('',({-radius:.8f},0.,{z:.8f}))")
        v1 = e.add(f"VERTEX_POINT('',{v1p})")
        v2 = e.add(f"VERTEX_POINT('',{v2p})")
        e1 = e.add(f"EDGE_CURVE('',{v1},{v2},{circ},.T.)")
        e2 = e.add(f"EDGE_CURVE('',{v2},{v1},{circ},.T.)")
        return loc, e1, e2

    def cap(z: float):
        loc_o, oe1, oe2 = ring(z, outer_r)
        _loc_i, ie1, ie2 = ring(z, inner_r)
        plane = e.add(f"PLANE('',{loc_o})")
        oes = [
            e.add(f"ORIENTED_EDGE('',*,*,{oe1},.T.)"),
            e.add(f"ORIENTED_EDGE('',*,*,{oe2},.T.)"),
        ]
        ies = [
            e.add(f"ORIENTED_EDGE('',*,*,{ie1},.T.)"),
            e.add(f"ORIENTED_EDGE('',*,*,{ie2},.T.)"),
        ]
        outer_loop = e.add("EDGE_LOOP('',(" + ",".join(oes) + "))")
        inner_loop = e.add("EDGE_LOOP('',(" + ",".join(ies) + "))")
        outer_b = e.add(f"FACE_OUTER_BOUND('',{outer_loop},.T.)")
        inner_b = e.add(f"FACE_BOUND('',{inner_loop},.T.)")
        face = e.add(f"ADVANCED_FACE('',({outer_b},{inner_b}),{plane},.T.)")
        return face, oe1, ie1

    top, toe1, tie1 = cap(hz)
    bot, boe1, bie1 = cap(-hz)
    o_bound = e.add(
        "FACE_OUTER_BOUND('',"
        + e.add(
            "EDGE_LOOP('',("
            + ",".join(
                [
                    e.add(f"ORIENTED_EDGE('',*,*,{toe1},.T.)"),
                    e.add(f"ORIENTED_EDGE('',*,*,{boe1},.F.)"),
                ]
            )
            + "))"
        )
        + ",.T.)"
    )
    i_bound = e.add(
        "FACE_OUTER_BOUND('',"
        + e.add(
            "EDGE_LOOP('',("
            + ",".join(
                [
                    e.add(f"ORIENTED_EDGE('',*,*,{tie1},.T.)"),
                    e.add(f"ORIENTED_EDGE('',*,*,{bie1},.F.)"),
                ]
            )
            + "))"
        )
        + ",.T.)"
    )
    wall_o = e.add(f"ADVANCED_FACE('',({o_bound}),{cyl_o},.T.)")
    wall_i = e.add(f"ADVANCED_FACE('',({i_bound}),{cyl_i},.F.)")
    shell = e.add(f"CLOSED_SHELL('',({wall_o},{wall_i},{top},{bot}))")
    solid = e.add(f"MANIFOLD_SOLID_BREP('{name}',{shell})")
    e.add(f"PRODUCT_DEFINITION_SHAPE('',$,{solid})")
    body = _header(name) + "\n".join(e.lines) + "\nENDSEC;\nEND-ISO-10303-21;\n"
    with open(path, "w", encoding="ascii") as f:
        f.write(body)
