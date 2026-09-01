"""Python mirrors of DesignIR parametric generators. Used by CAD tests and benchmarks."""
from __future__ import annotations


def bearing_housing(bearing_od: float, wall: float, span: float) -> dict:
    return {
        "generator": "BearingHousingGenerator",
        "inner_r": bearing_od / 2.0,
        "outer_r": bearing_od / 2.0 + wall,
        "height": span,
    }


def shaft(journal_d: float, length: float) -> dict:
    return {
        "generator": "ShaftGenerator",
        "radius": journal_d / 2.0,
        "height": length,
    }


def spacer(inner_d: float, outer_d: float, width: float) -> dict:
    return {
        "generator": "SpacerGenerator",
        "inner_r": inner_d / 2.0,
        "outer_r": outer_d / 2.0,
        "height": width,
    }


def flange(od: float, id_: float, thickness: float) -> dict:
    return {
        "generator": "FlangeGenerator",
        "inner_r": id_ / 2.0,
        "outer_r": od / 2.0,
        "height": thickness,
    }


def service_cover(sx: float, sy: float, thickness: float) -> dict:
    return {"generator": "ServiceCoverGenerator", "sx": sx, "sy": sy, "sz": thickness}


def bracket(sx: float, sy: float, sz: float) -> dict:
    return {"generator": "BracketGenerator", "sx": sx, "sy": sy, "sz": sz}


def retainer(bearing_od: float, lip: float, thickness: float) -> dict:
    inner = max(0.001, bearing_od / 2.0 - lip)
    return {
        "generator": "RetainerGenerator",
        "inner_r": inner,
        "outer_r": bearing_od / 2.0 + lip,
        "height": thickness,
    }


def enclosure_with_lid(sx: float, sy: float, sz: float, lid: float) -> dict:
    return {
        "generator": "ElectronicsEnclosure",
        "body": {"sx": sx, "sy": sy, "sz": sz},
        "lid": {"sx": sx, "sy": sy, "sz": lid},
    }
