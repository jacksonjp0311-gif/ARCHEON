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
