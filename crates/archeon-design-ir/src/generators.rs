//! Parametric component generators.
//!
//! Output is DesignIR fragments (features, ports, envelope, provenance) — not Three.js meshes.
//! Geometry is produced later by the CAD worker from those fragments.

use crate::entities::{Feature, FeatureFrame, FeatureKind, Port};
use crate::ids::EntityId;
use archeon_provenance::Provenance;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratorOutput {
    pub generator: String,
    pub envelope: Envelope,
    pub features: Vec<Feature>,
    pub ports: Vec<Port>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Envelope {
    Box {
        sx: f64,
        sy: f64,
        sz: f64,
    },
    Cylinder {
        radius: f64,
        height: f64,
    },
    Tube {
        inner_r: f64,
        outer_r: f64,
        height: f64,
    },
}

fn pv(created_by: &str, reason: &str) -> Provenance {
    let mut p = Provenance::generated(created_by, reason);
    p.agent_id = Some(created_by.into());
    p.tools = vec!["parametric_generator".into()];
    p
}

fn feat(
    id: &str,
    part: &str,
    kind: FeatureKind,
    role: &str,
    params: BTreeMap<String, serde_json::Value>,
    reason: &str,
) -> Feature {
    Feature {
        id: EntityId::new(id),
        part: EntityId::new(part),
        kind,
        semantic_role: role.into(),
        params,
        frame: FeatureFrame {
            host: Some(EntityId::new(part)),
            ..Default::default()
        },
        provenance: pv("cad-designer", reason),
    }
}

fn num(v: f64) -> serde_json::Value {
    serde_json::json!(v)
}

fn port(id: &str, host: &str, role: &str, origin: [f64; 3]) -> Port {
    Port {
        id: EntityId::new(id),
        host: EntityId::new(host),
        role: role.into(),
        datum: None,
        origin_m: origin,
        provenance: pv("assembly-designer", "Interface-first port from generator."),
    }
}

pub fn bearing_housing(
    part_id: &str,
    bearing_od: f64,
    bearing_width: f64,
    wall_thickness: f64,
    span: f64,
) -> GeneratorOutput {
    let outer_r = bearing_od / 2.0 + wall_thickness;
    let height = span.max(bearing_width * 2.0 + wall_thickness);
    let mut seat = BTreeMap::new();
    seat.insert("bearing_od_m".into(), num(bearing_od));
    seat.insert("wall_thickness_m".into(), num(wall_thickness));
    seat.insert("span_m".into(), num(height));
    GeneratorOutput {
        generator: "BearingHousingGenerator".into(),
        envelope: Envelope::Tube {
            inner_r: bearing_od / 2.0,
            outer_r,
            height,
        },
        features: vec![
            feat(
                &format!("feat.{part_id}.body"),
                part_id,
                FeatureKind::Cylinder,
                "housing_body",
                {
                    let mut p = BTreeMap::new();
                    p.insert("radius_m".into(), num(outer_r));
                    p.insert("height_m".into(), num(height));
                    p
                },
                "Outer envelope from bearing OD + wall.",
            ),
            feat(
                &format!("feat.{part_id}.seat"),
                part_id,
                FeatureKind::BearingSeat,
                "bearing_seat",
                seat,
                "Seat diameter DERIVED from bearing OD. Fit class ASSUMED.",
            ),
        ],
        ports: vec![
            port(
                &format!("port.{part_id}.seat_a"),
                part_id,
                "bearing_seat",
                [0.0, -height / 4.0, 0.0],
            ),
            port(
                &format!("port.{part_id}.seat_b"),
                part_id,
                "bearing_seat",
                [0.0, height / 4.0, 0.0],
            ),
        ],
        notes: vec!["wall_thickness is ASSUMED unless user-specified.".into()],
    }
}

pub fn shaft(
    part_id: &str,
    journal_d: f64,
    length: f64,
    step_d: Option<f64>,
    step_length: Option<f64>,
) -> GeneratorOutput {
    let mut features = vec![feat(
        &format!("feat.{part_id}.journal"),
        part_id,
        FeatureKind::Cylinder,
        "journal",
        {
            let mut p = BTreeMap::new();
            p.insert("radius_m".into(), num(journal_d / 2.0));
            p.insert("height_m".into(), num(length));
            p
        },
        "Journal diameter DERIVED from bearing ID.",
    )];
    if let (Some(sd), Some(sl)) = (step_d, step_length) {
        let mut p = BTreeMap::new();
        p.insert("diameter_m".into(), num(sd));
        p.insert("length_m".into(), num(sl));
        features.push(feat(
            &format!("feat.{part_id}.step"),
            part_id,
            FeatureKind::ShaftStep,
            "shoulder",
            p,
            "Retention shoulder. Fit ASSUMED.",
        ));
    }
    GeneratorOutput {
        generator: "ShaftGenerator".into(),
        envelope: Envelope::Cylinder {
            radius: journal_d / 2.0,
            height: length,
        },
        features,
        ports: vec![
            port(
                &format!("port.{part_id}.journal_a"),
                part_id,
                "radial_bearing_journal",
                [0.0, -length / 4.0, 0.0],
            ),
            port(
                &format!("port.{part_id}.journal_b"),
                part_id,
                "radial_bearing_journal",
                [0.0, length / 4.0, 0.0],
            ),
        ],
        notes: vec!["No ISO 286 fit class is claimed.".into()],
    }
}

pub fn motor_mount(
    part_id: &str,
    bolt_circle: f64,
    thickness: f64,
    motor_od: f64,
) -> GeneratorOutput {
    let sx = (motor_od + 0.02).max(bolt_circle + 0.02);
    let mut p = BTreeMap::new();
    p.insert("bolt_circle_m".into(), num(bolt_circle));
    p.insert("count".into(), num(4.0));
    GeneratorOutput {
        generator: "MotorMountGenerator".into(),
        envelope: Envelope::Box {
            sx,
            sy: thickness,
            sz: sx,
        },
        features: vec![
            feat(
                &format!("feat.{part_id}.plate"),
                part_id,
                FeatureKind::Box,
                "mount_plate",
                {
                    let mut q = BTreeMap::new();
                    q.insert("sx".into(), num(sx));
                    q.insert("sy".into(), num(thickness));
                    q.insert("sz".into(), num(sx));
                    q
                },
                "Motor mount plate envelope.",
            ),
            feat(
                &format!("feat.{part_id}.pattern"),
                part_id,
                FeatureKind::MountPattern,
                "motor_flange_bolts",
                p,
                "GENERIC four-bolt pattern. Not a manufacturer flange PN.",
            ),
        ],
        ports: vec![port(
            &format!("port.{part_id}.motor"),
            part_id,
            "motor_output",
            [0.0, 0.0, 0.0],
        )],
        notes: vec!["Bolt circle is PARAMETRIC_REFERENCE.".into()],
    }
}

pub fn gearbox_housing(part_id: &str, od: f64, length: f64) -> GeneratorOutput {
    GeneratorOutput {
        generator: "GearboxHousingGenerator".into(),
        envelope: Envelope::Cylinder {
            radius: od / 2.0,
            height: length,
        },
        features: vec![feat(
            &format!("feat.{part_id}.envelope"),
            part_id,
            FeatureKind::Cylinder,
            "gearbox_envelope",
            {
                let mut p = BTreeMap::new();
                p.insert("radius_m".into(), num(od / 2.0));
                p.insert("height_m".into(), num(length));
                p
            },
            "Reduction envelope. Internal gears are NOT modeled.",
        )],
        ports: vec![
            port(
                &format!("port.{part_id}.input"),
                part_id,
                "gearbox_input",
                [0.0, -length / 2.0, 0.0],
            ),
            port(
                &format!("port.{part_id}.output"),
                part_id,
                "gearbox_output",
                [0.0, length / 2.0, 0.0],
            ),
        ],
        notes: vec!["Envelope only. No tooth geometry.".into()],
    }
}

pub fn flange(part_id: &str, od: f64, id: f64, thickness: f64, bolt_count: u32) -> GeneratorOutput {
    let mut p = BTreeMap::new();
    p.insert("od_m".into(), num(od));
    p.insert("id_m".into(), num(id));
    p.insert("count".into(), num(bolt_count as f64));
    GeneratorOutput {
        generator: "FlangeGenerator".into(),
        envelope: Envelope::Tube {
            inner_r: id / 2.0,
            outer_r: od / 2.0,
            height: thickness,
        },
        features: vec![feat(
            &format!("feat.{part_id}.flange"),
            part_id,
            FeatureKind::Flange,
            "flange",
            p,
            "Parametric flange. SEMANTIC until CAD authors the ring.",
        )],
        ports: vec![port(
            &format!("port.{part_id}.face"),
            part_id,
            "flange_face",
            [0.0, 0.0, 0.0],
        )],
        notes: vec!["Flange feature is SEMANTIC_ONLY in the primitive kernel.".into()],
    }
}

pub fn bracket(part_id: &str, sx: f64, sy: f64, sz: f64, bolt_count: u32) -> GeneratorOutput {
    let mut p = BTreeMap::new();
    p.insert("count".into(), num(bolt_count as f64));
    GeneratorOutput {
        generator: "BracketGenerator".into(),
        envelope: Envelope::Box { sx, sy, sz },
        features: vec![
            feat(
                &format!("feat.{part_id}.body"),
                part_id,
                FeatureKind::Box,
                "bracket",
                {
                    let mut q = BTreeMap::new();
                    q.insert("sx".into(), num(sx));
                    q.insert("sy".into(), num(sy));
                    q.insert("sz".into(), num(sz));
                    q
                },
                "Structural bracket envelope.",
            ),
            feat(
                &format!("feat.{part_id}.holes"),
                part_id,
                FeatureKind::MountPattern,
                "mount_holes",
                p,
                "Host holes for GENERIC bolts.",
            ),
        ],
        ports: vec![port(
            &format!("port.{part_id}.mount"),
            part_id,
            "structural_mount",
            [0.0, 0.0, 0.0],
        )],
        notes: vec![],
    }
}

pub fn spacer(part_id: &str, inner_d: f64, outer_d: f64, width: f64) -> GeneratorOutput {
    GeneratorOutput {
        generator: "SpacerGenerator".into(),
        envelope: Envelope::Tube {
            inner_r: inner_d / 2.0,
            outer_r: outer_d / 2.0,
            height: width,
        },
        features: vec![feat(
            &format!("feat.{part_id}.tube"),
            part_id,
            FeatureKind::Cylinder,
            "spacer",
            {
                let mut p = BTreeMap::new();
                p.insert("inner_r_m".into(), num(inner_d / 2.0));
                p.insert("outer_r_m".into(), num(outer_d / 2.0));
                p.insert("height_m".into(), num(width));
                p
            },
            "Axial spacer between bearing faces.",
        )],
        ports: vec![],
        notes: vec![],
    }
}

pub fn fastener_pattern(
    part_id: &str,
    diameter: f64,
    count: u32,
    bolt_circle: f64,
) -> GeneratorOutput {
    let mut p = BTreeMap::new();
    p.insert("diameter_m".into(), num(diameter));
    p.insert("count".into(), num(count as f64));
    p.insert("bolt_circle_m".into(), num(bolt_circle));
    GeneratorOutput {
        generator: "FastenerPatternGenerator".into(),
        envelope: Envelope::Cylinder {
            radius: bolt_circle / 2.0 + diameter,
            height: diameter * 4.0,
        },
        features: vec![feat(
            &format!("feat.{part_id}.pattern"),
            part_id,
            FeatureKind::Pattern,
            "fastener_pattern",
            p,
            "Cosmetic fastener pattern. Threads are THREAD_REFERENCE, not helix BREP.",
        )],
        ports: vec![],
        notes: vec!["Thread geometry is not modeled.".into()],
    }
}

pub fn bearing_seat(part_id: &str, bearing_od: f64, width: f64) -> GeneratorOutput {
    let mut p = BTreeMap::new();
    p.insert("diameter_m".into(), num(bearing_od));
    p.insert("depth_m".into(), num(width));
    GeneratorOutput {
        generator: "BearingSeatGenerator".into(),
        envelope: Envelope::Cylinder {
            radius: bearing_od / 2.0,
            height: width,
        },
        features: vec![feat(
            &format!("feat.{part_id}.seat"),
            part_id,
            FeatureKind::BearingSeat,
            "bearing_seat",
            p,
            "Seat DERIVED from bearing OD.",
        )],
        ports: vec![port(
            &format!("port.{part_id}.seat"),
            part_id,
            "bearing_seat",
            [0.0, 0.0, 0.0],
        )],
        notes: vec![],
    }
}

pub fn structural_link(part_id: &str, length: f64, section: f64) -> GeneratorOutput {
    GeneratorOutput {
        generator: "StructuralLinkGenerator".into(),
        envelope: Envelope::Box {
            sx: length,
            sy: section,
            sz: section,
        },
        features: vec![feat(
            &format!("feat.{part_id}.extrude"),
            part_id,
            FeatureKind::Extrude,
            "link_body",
            {
                let mut p = BTreeMap::new();
                p.insert("depth_m".into(), num(length));
                p.insert("sx".into(), num(section));
                p.insert("sy".into(), num(section));
                p
            },
            "Parametric link extrusion analog.",
        )],
        ports: vec![],
        notes: vec![],
    }
}

pub fn retainer(part_id: &str, bearing_od: f64, lip: f64, thickness: f64) -> GeneratorOutput {
    let inner = (bearing_od / 2.0 - lip).max(0.001);
    let outer = bearing_od / 2.0 + lip;
    GeneratorOutput {
        generator: "RetainerGenerator".into(),
        envelope: Envelope::Tube {
            inner_r: inner,
            outer_r: outer,
            height: thickness,
        },
        features: vec![feat(
            &format!("feat.{part_id}.ring"),
            part_id,
            FeatureKind::Hole,
            "retainer_bore",
            {
                let mut p = BTreeMap::new();
                p.insert("inner_r_m".into(), num(inner));
                p.insert("diameter_m".into(), num(inner * 2.0));
                p.insert("thickness_m".into(), num(thickness));
                p
            },
            "Retention ring lip over the bearing outer race. Not a snap-ring catalog PN.",
        )],
        ports: vec![],
        notes: vec![
            "Retainer is a thin ring. Exact tube when the kernel authors a hollow cylinder.".into(),
        ],
    }
}

pub fn service_cover(part_id: &str, sx: f64, sy: f64, thickness: f64) -> GeneratorOutput {
    GeneratorOutput {
        generator: "ServiceCoverGenerator".into(),
        envelope: Envelope::Box {
            sx,
            sy,
            sz: thickness,
        },
        features: vec![feat(
            &format!("feat.{part_id}.cover"),
            part_id,
            FeatureKind::Box,
            "service_cover",
            {
                let mut p = BTreeMap::new();
                p.insert("sx".into(), num(sx));
                p.insert("sy".into(), num(sy));
                p.insert("sz".into(), num(thickness));
                p
            },
            "Removable service cover.",
        )],
        ports: vec![port(
            &format!("port.{part_id}.access"),
            part_id,
            "service_access",
            [0.0, 0.0, 0.0],
        )],
        notes: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn housing_derives_seat_from_bearing_od() {
        let g = bearing_housing("part.demo.housing", 0.047, 0.014, 0.008, 0.08);
        assert_eq!(g.generator, "BearingHousingGenerator");
        assert_eq!(g.ports.len(), 2);
        match g.envelope {
            Envelope::Tube {
                inner_r, outer_r, ..
            } => {
                assert!((inner_r - 0.0235).abs() < 1e-9);
                assert!((outer_r - 0.0315).abs() < 1e-9);
            }
            _ => panic!("expected tube"),
        }
        assert!(g
            .features
            .iter()
            .any(|f| f.kind == FeatureKind::BearingSeat));
    }

    #[test]
    fn shaft_journal_matches_bearing_id() {
        let g = shaft("part.demo.shaft", 0.020, 0.12, Some(0.024), Some(0.008));
        assert!(g.features.iter().any(|f| f.kind == FeatureKind::ShaftStep));
        match g.envelope {
            Envelope::Cylinder { radius, .. } => assert!((radius - 0.010).abs() < 1e-9),
            _ => panic!("expected cylinder"),
        }
    }

    #[test]
    fn every_named_generator_emits_identity() {
        let gens = [
            bearing_housing("p.h", 0.047, 0.014, 0.008, 0.08).generator,
            shaft("p.s", 0.02, 0.1, None, None).generator,
            motor_mount("p.m", 0.05, 0.008, 0.06).generator,
            gearbox_housing("p.g", 0.08, 0.05).generator,
            flange("p.f", 0.08, 0.03, 0.008, 4).generator,
            bracket("p.b", 0.08, 0.01, 0.04, 4).generator,
            spacer("p.sp", 0.02, 0.03, 0.01).generator,
            fastener_pattern("p.fp", 0.005, 4, 0.04).generator,
            bearing_seat("p.bs", 0.047, 0.014).generator,
            structural_link("p.l", 0.4, 0.05).generator,
            service_cover("p.c", 0.09, 0.07, 0.004).generator,
            retainer("p.r", 0.047, 0.003, 0.003).generator,
        ];
        assert_eq!(gens.len(), 12);
        for g in gens {
            assert!(g.ends_with("Generator"));
        }
    }
}
