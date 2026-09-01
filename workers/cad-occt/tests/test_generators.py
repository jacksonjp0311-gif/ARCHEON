from archeon_cad.generators import bearing_housing, shaft, enclosure_with_lid, bracket, retainer
from archeon_cad.library import by_designation, GENERIC


def test_generic_6204_envelope():
    b = by_designation("GENERIC_6204_BEARING")
    assert b is not None
    assert b["truth"] == "PARAMETRIC_REFERENCE"
    assert b["params"]["inner_diameter_m"] == 0.020
    assert b["params"]["outer_diameter_m"] == 0.047
    assert b["params"]["width_m"] == 0.014
    assert "SKF" not in b["note"]


def test_library_classes_present():
    classes = {c["class"] for c in GENERIC}
    for need in (
        "bearing",
        "bolt",
        "nut",
        "washer",
        "shaft",
        "motor",
        "gearbox",
        "coupling",
        "linear_bearing",
        "bushing",
    ):
        assert need in classes


def test_housing_generator_derives_bore():
    g = bearing_housing(0.047, 0.008, 0.08)
    assert g["inner_r"] == 0.0235
    assert abs(g["outer_r"] - 0.0315) < 1e-9


def test_shaft_generator_journal():
    g = shaft(0.020, 0.12)
    assert g["radius"] == 0.010


def test_retainer_is_a_ring():
    g = retainer(0.047, 0.003, 0.003)
    assert g["generator"] == "RetainerGenerator"
    assert g["inner_r"] < g["outer_r"]


def test_enclosure_and_bracket_generators():
    e = enclosure_with_lid(0.12, 0.08, 0.05, 0.004)
    assert e["lid"]["sz"] == 0.004
    b = bracket(0.08, 0.01, 0.04)
    assert b["generator"] == "BracketGenerator"
