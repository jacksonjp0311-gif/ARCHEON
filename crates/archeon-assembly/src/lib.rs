//! Assembly graph queries. Explosion is an alternate spatial projection, not animation.
use archeon_design_ir::{DesignDocument, Part};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplosionOffset {
    pub part: String,
    pub delta_m: [f64; 3],
}

/// Deterministic explosion offset for a part at factor t ∈ [0, 1].
pub fn offset_for(part: &Part, strategy: ExplosionStrategy, t: f64, sequence_len: u32) -> [f64; 3] {
    let t = t.clamp(0.0, 1.0);
    let v = part.spatial.explosion_vector;
    let d = if part.spatial.explosion_distance_m == 0.0 {
        0.12
    } else {
        part.spatial.explosion_distance_m
    };
    let mag = match strategy {
        ExplosionStrategy::Sequence => {
            let stage = part.spatial.assembly_stage.max(1);
            let rank = sequence_len.saturating_sub(stage).max(1) as f64;
            d * t * (0.35 + 0.08 * rank)
        }
        ExplosionStrategy::Axial => d * t * v[2].signum().abs().max(1.0),
        ExplosionStrategy::Radial => d * t,
        ExplosionStrategy::System | ExplosionStrategy::Graph => d * t * 0.8,
        ExplosionStrategy::BomFocus => d * t * 0.2,
        ExplosionStrategy::Service => d * t * 1.2,
        ExplosionStrategy::Custom => d * t,
    };
    match strategy {
        ExplosionStrategy::Axial => [0.0, 0.0, mag * if v[2] == 0.0 { 1.0 } else { v[2].signum() }],
        _ => [v[0] * mag, v[1] * mag, v[2] * mag],
    }
}

pub fn explode_document(doc: &DesignDocument, strategy: ExplosionStrategy, t: f64) -> Vec<ExplosionOffset> {
    let n = doc.assembly_sequence.len().max(doc.parts.len()) as u32;
    doc.parts
        .iter()
        .map(|p| ExplosionOffset {
            part: p.id.0.clone(),
            delta_m: offset_for(p, strategy, t, n),
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
        assert!((a[0] - 0.1).abs() < 1e-12);
        assert_eq!(a[1], 0.0);
    }

    #[test]
    fn assembled_is_zero() {
        let p = part("part.a", 1, [0.0, 0.0, 1.0], 0.5);
        let a = offset_for(&p, ExplosionStrategy::Sequence, 0.0, 7);
        assert_eq!(a, [0.0, 0.0, 0.0]);
    }
}
