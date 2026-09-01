//! Assembly graph queries. Explosion is an alternate spatial projection, not animation.
use archeon_design_ir::{DesignDocument, EntityId, Part};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExplosionStrategy {
    Radial,
    Axial,
    Sequence,
    System,
    BomFocus,
    Service,
    Graph,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SpreadPreset {
    Compact,
    Normal,
    Engineering,
    Wide,
    Extreme,
}

#[derive(Debug, Clone, Copy)]
pub struct ExplosionProfile {
    pub spread_scale: f64,
    pub minimum_separation: f64,
    pub hierarchy_spacing: f64,
    pub stage_spacing: f64,
    pub radial_spacing: f64,
    pub camera_margin: f64,
}

impl SpreadPreset {
    pub fn profile(self) -> ExplosionProfile {
        match self {
            Self::Compact => ExplosionProfile {
                spread_scale: 1.35,
                minimum_separation: 0.05,
                hierarchy_spacing: 0.55,
                stage_spacing: 0.09,
                radial_spacing: 0.85,
                camera_margin: 1.35,
            },
            Self::Normal => ExplosionProfile {
                spread_scale: 2.6,
                minimum_separation: 0.09,
                hierarchy_spacing: 0.95,
                stage_spacing: 0.16,
                radial_spacing: 1.15,
                camera_margin: 1.55,
            },
            Self::Engineering => ExplosionProfile {
                spread_scale: 4.2,
                minimum_separation: 0.16,
                hierarchy_spacing: 1.25,
                stage_spacing: 0.24,
                radial_spacing: 1.55,
                camera_margin: 1.85,
            },
            Self::Wide => ExplosionProfile {
                spread_scale: 6.8,
                minimum_separation: 0.24,
                hierarchy_spacing: 1.7,
                stage_spacing: 0.34,
                radial_spacing: 2.05,
                camera_margin: 2.25,
            },
            Self::Extreme => ExplosionProfile {
                spread_scale: 10.5,
                minimum_separation: 0.38,
                hierarchy_spacing: 2.3,
                stage_spacing: 0.48,
                radial_spacing: 2.9,
                camera_margin: 2.85,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplosionOffset {
    pub part: String,
    pub delta_m: [f64; 3],
}

fn smoothstep(t: f64) -> f64 {
    let x = t.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

fn len3(v: [f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

fn norm3(v: [f64; 3]) -> [f64; 3] {
    let n = len3(v);
    if n < 1e-9 {
        [0.0, 0.0, 1.0]
    } else {
        [v[0] / n, v[1] / n, v[2] / n]
    }
}

fn scale3(v: [f64; 3], s: f64) -> [f64; 3] {
    [v[0] * s, v[1] * s, v[2] * s]
}

/// Deterministic explosion offset. Default spread is ENGINEERING.
pub fn offset_for(part: &Part, strategy: ExplosionStrategy, t: f64, sequence_len: u32) -> [f64; 3] {
    offset_for_profile(
        part,
        strategy,
        t,
        sequence_len,
        SpreadPreset::Engineering,
        0,
    )
}

pub fn offset_for_profile(
    part: &Part,
    strategy: ExplosionStrategy,
    t: f64,
    sequence_len: u32,
    preset: SpreadPreset,
    depth: u32,
) -> [f64; 3] {
    let profile = preset.profile();
    let k = smoothstep(t.clamp(0.0, 1.0));
    if k <= 0.0 {
        return [0.0, 0.0, 0.0];
    }
    let depth = depth as f64;
    let stage = part.spatial.assembly_stage.max(1);
    let rank = sequence_len.saturating_sub(stage).max(1) as f64;
    let base = if part.spatial.explosion_distance_m > 0.0 {
        part.spatial.explosion_distance_m
    } else {
        0.12
    };
    let v = norm3(part.spatial.explosion_vector);
    let mut dir = v;
    let mut mag = base * profile.spread_scale * k;
    match strategy {
        ExplosionStrategy::Sequence => {
            mag *= 0.55 + profile.stage_spacing * rank + profile.hierarchy_spacing * 0.15 * depth;
        }
        ExplosionStrategy::Axial => {
            dir = [
                0.0,
                0.0,
                if part.spatial.explosion_vector[2] == 0.0 {
                    1.0
                } else {
                    part.spatial.explosion_vector[2].signum()
                },
            ];
            mag *= 0.7 + profile.hierarchy_spacing * 0.2 * depth;
        }
        ExplosionStrategy::System => {
            let assembly_k = smoothstep((t / 0.45).clamp(0.0, 1.0));
            let child_k = if t > 0.35 {
                smoothstep(((t - 0.35) / 0.65).clamp(0.0, 1.0))
            } else {
                0.0
            };
            let assembly_mag = base
                * profile.spread_scale
                * profile.hierarchy_spacing
                * assembly_k
                * if depth == 0.0 { 1.15 } else { 0.35 };
            let child_mag =
                base * profile.spread_scale * profile.stage_spacing * child_k * (1.0 + depth);
            mag = assembly_mag + child_mag;
        }
        ExplosionStrategy::BomFocus => mag *= 0.22 + 0.08 * depth,
        ExplosionStrategy::Service => {
            if part.spatial.service_path.len() >= 2 {
                let a = part.spatial.service_path[0];
                let b = part.spatial.service_path[part.spatial.service_path.len() - 1];
                dir = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
            }
            mag *= 1.15 + profile.hierarchy_spacing * 0.2;
        }
        ExplosionStrategy::Graph => mag *= 0.7 + profile.radial_spacing * 0.25 + 0.12 * depth,
        ExplosionStrategy::Custom => {}
        ExplosionStrategy::Radial => {
            mag *= profile.radial_spacing * (0.55 + 0.12 * rank * 0.08 + 0.18 * depth);
        }
    }
    mag = mag.max(profile.minimum_separation * k * (1.0 + 0.15 * depth));
    scale3(dir, mag)
}

fn assembly_depth(doc: &DesignDocument, parent: Option<&EntityId>) -> u32 {
    let mut d = 0u32;
    let mut pid = parent;
    while let Some(id) = pid {
        d += 1;
        pid = doc
            .assemblies
            .iter()
            .find(|a| a.id == *id)
            .and_then(|a| a.parent.as_ref());
        if d > 8 {
            break;
        }
    }
    d
}

pub fn explode_document(
    doc: &DesignDocument,
    strategy: ExplosionStrategy,
    t: f64,
) -> Vec<ExplosionOffset> {
    explode_document_spread(doc, strategy, t, SpreadPreset::Engineering)
}

pub fn explode_document_spread(
    doc: &DesignDocument,
    strategy: ExplosionStrategy,
    t: f64,
    preset: SpreadPreset,
) -> Vec<ExplosionOffset> {
    let n = doc.assembly_sequence.len().max(doc.parts.len()) as u32;
    doc.parts
        .iter()
        .map(|p| ExplosionOffset {
            part: p.id.0.clone(),
            delta_m: offset_for_profile(
                p,
                strategy,
                t,
                n,
                preset,
                assembly_depth(doc, p.parent.as_ref()),
            ),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use archeon_design_ir::{EntityId, Part, Primitive, Spatial};
    use archeon_provenance::Provenance;

    fn part(id: &str, stage: u32, vec: [f64; 3], dist: f64) -> Part {
        Part {
            id: EntityId::new(id),
            name: id.into(),
            parent: None,
            system: None,
            material: None,
            semantic_role: "link".into(),
            qty: 1,
            catalog_ref: None,
            spatial: Spatial {
                origin_m: [0.0, 0.0, 0.0],
                rpy_rad: [0.0, 0.0, 0.0],
                primitive: Primitive::Box {
                    sx: 0.1,
                    sy: 0.1,
                    sz: 0.1,
                },
                assembly_stage: stage,
                explosion_vector: vec,
                explosion_distance_m: dist,
                radial_group: None,
                parent_axis: None,
                service_path: vec![],
                cad: None,
            },
            provenance: Provenance::generated("t", "t"),
        }
    }

    #[test]
    fn explosion_is_deterministic() {
        let p = part("part.a", 3, [1.0, 0.0, 0.0], 0.2);
        let a = offset_for(&p, ExplosionStrategy::Radial, 0.5, 7);
        let b = offset_for(&p, ExplosionStrategy::Radial, 0.5, 7);
        assert_eq!(a, b);
        assert_eq!(a[1], 0.0);
    }

    #[test]
    fn assembled_is_zero() {
        let p = part("part.a", 1, [0.0, 0.0, 1.0], 0.5);
        let a = offset_for(&p, ExplosionStrategy::Sequence, 0.0, 7);
        assert_eq!(a, [0.0, 0.0, 0.0]);
    }

    #[test]
    fn engineering_spread_exceeds_compact() {
        let p = part("part.a", 3, [1.0, 0.0, 0.0], 0.2);
        let compact = offset_for_profile(
            &p,
            ExplosionStrategy::Radial,
            1.0,
            7,
            SpreadPreset::Compact,
            1,
        );
        let engineering = offset_for_profile(
            &p,
            ExplosionStrategy::Radial,
            1.0,
            7,
            SpreadPreset::Engineering,
            1,
        );
        let c =
            (compact[0] * compact[0] + compact[1] * compact[1] + compact[2] * compact[2]).sqrt();
        let e = (engineering[0] * engineering[0]
            + engineering[1] * engineering[1]
            + engineering[2] * engineering[2])
            .sqrt();
        assert!(e > c);
    }
}
