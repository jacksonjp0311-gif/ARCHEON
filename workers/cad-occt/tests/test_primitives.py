from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from archeon_cad.step_writer import write_box_step, write_cylinder_step  # noqa: E402
from archeon_cad.stl_writer import write_box_stl, write_cylinder_stl  # noqa: E402
from archeon_cad.kernel import PrimitiveKernelAdapter  # noqa: E402


def test_box_step_is_brep(tmp_path: Path):
    p = tmp_path / "box.step"
    write_box_step(str(p), 0.2, 0.1, 0.05, "demo_box")
    text = p.read_text(encoding="ascii")
    assert "ISO-10303-21" in text
    assert "MANIFOLD_SOLID_BREP" in text
    assert "ADVANCED_FACE" in text


def test_cylinder_step_has_cylindrical_surface(tmp_path: Path):
    p = tmp_path / "cyl.step"
    write_cylinder_step(str(p), 0.02, 0.08, "demo_cyl")
    text = p.read_text(encoding="ascii")
    assert "CYLINDRICAL_SURFACE" in text
    assert "MANIFOLD_SOLID_BREP" in text


def test_stl_has_facets(tmp_path: Path):
    p = tmp_path / "box.stl"
    write_box_stl(str(p), 1, 1, 1)
    text = p.read_text(encoding="ascii")
    assert text.count("facet normal") == 12


def test_cylinder_stl_is_z_up(tmp_path: Path):
    p = tmp_path / "cyl.stl"
    write_cylinder_stl(str(p), 0.02, 0.08)
    zs = []
    for line in p.read_text(encoding="ascii").splitlines():
        parts = line.split()
        if len(parts) == 4 and parts[0] == "vertex":
            zs.append(float(parts[3]))
    assert zs
    assert min(zs) == -0.04
    assert max(zs) == 0.04


def test_box_stl_is_cad_local_not_recentered(tmp_path: Path):
    p = tmp_path / "box.stl"
    write_box_stl(str(p), 0.2, 0.1, 0.05)
    xs, ys, zs = [], [], []
    for line in p.read_text(encoding="ascii").splitlines():
        parts = line.split()
        if len(parts) == 4 and parts[0] == "vertex":
            x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
            xs.append(x)
            ys.append(y)
            zs.append(z)
    assert xs and ys and zs
    assert min(xs) == -0.1 and max(xs) == 0.1
    assert min(ys) == -0.05 and max(ys) == 0.05
    assert min(zs) == -0.025 and max(zs) == 0.025
    assert abs((min(xs) + max(xs)) / 2) < 1e-12
    assert abs((min(ys) + max(ys)) / 2) < 1e-12
    assert abs((min(zs) + max(zs)) / 2) < 1e-12


def test_tube_step_is_brep(tmp_path: Path):
    from archeon_cad.step_writer import write_tube_step

    p = tmp_path / "tube.step"
    write_tube_step(str(p), 0.01, 0.02, 0.04, "demo_tube")
    text = p.read_text(encoding="ascii")
    assert "ISO-10303-21" in text
    assert "CYLINDRICAL_SURFACE" in text
    assert "MANIFOLD_SOLID_BREP" in text


def test_kernel_applies_bearing_seat_as_tube(tmp_path: Path):
    doc = {
        "parts": [
            {
                "id": "part.demo.spacer",
                "material": "mat.steel",
                "spatial": {"primitive": {"kind": "cylinder", "radius": 0.016, "height": 0.016}},
            }
        ],
        "features": [
            {
                "id": "feat.demo.bore",
                "part": "part.demo.spacer",
                "kind": "bearing_seat",
                "params": {"inner_r_m": 0.010, "diameter_m": 0.020},
            }
        ],
        "materials": [{"id": "mat.steel", "density_kg_m3": 7850}],
    }
    out = tmp_path / "gen"
    result = PrimitiveKernelAdapter().regenerate(doc, out)
    rec = result["parts"][0]
    assert "tube" in rec["applied_features"]
    assert rec["exact"] is True
    assert Path(rec["step"]).exists()


def test_kernel_regenerate_from_minimal_doc(tmp_path: Path):
    doc = {
        "parts": [
            {
                "id": "part.demo.box",
                "material": "mat.al6061",
                "spatial": {"primitive": {"kind": "box", "sx": 0.1, "sy": 0.2, "sz": 0.3}},
            }
        ],
        "materials": [{"id": "mat.al6061", "density_kg_m3": 2700}],
    }
    out = tmp_path / "gen"
    result = PrimitiveKernelAdapter().regenerate(doc, out)
    assert result["ok"]
    assert result["kernel"] == "primitive"
    assert Path(result["parts"][0]["step"]).exists()
    assert result["parts"][0]["mass_class"] == "ASSUMED"
    assert result["interference"]["checked"] is False
