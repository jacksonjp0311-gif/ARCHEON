//! Design Transaction Protocol — agents propose, humans commit.
use archeon_design_ir::{DesignDocument, EntityId, Part, Primitive, Requirement, Spatial};
use archeon_provenance::Provenance;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TxStatus {
    Proposed,
    Validating,
    Valid,
    Invalid,
    Approved,
    Committed,
    Rejected,
    RolledBack,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UserDecision {
    Pending,
    Approve,
    Reject,
    Modify,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Authority {
    Read,
    Propose,
    Validate,
    Commit,
    Admin,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Operation {
    CreatePart {
        id: String,
        name: String,
        parent: Option<String>,
        semantic_role: String,
        #[serde(default)]
        origin_m: [f64; 3],
        primitive: Primitive,
    },
    DeletePart {
        id: String,
    },
    ChangeParameter {
        name: String,
        value: f64,
        #[serde(default)]
        unit: Option<String>,
    },
    ChangeDimension {
        part: String,
        field: String,
        value: f64,
    },
    ChangeMaterial {
        part: String,
        material: String,
    },
    MoveComponent {
        id: String,
        origin_m: [f64; 3],
    },
    CreateRequirement {
        id: String,
        text: String,
        #[serde(default)]
        value: Option<f64>,
        #[serde(default)]
        unit: Option<String>,
    },
    ModifyRequirement {
        id: String,
        text: Option<String>,
        value: Option<f64>,
    },
    CreatePort {
        id: String,
        host: String,
        role: String,
    },
    CreateInterface {
        id: String,
        name: String,
        a: String,
        b: String,
        kind: String,
    },
    CreateMate {
        id: String,
        interface: String,
        kind: String,
    },
    CreateDatum {
        id: String,
        host: String,
        kind: String,
    },
    CreateSketch {
        id: String,
        part: String,
        kind: String,
    },
    Extrude {
        id: String,
        part: String,
        depth_m: f64,
    },
    RunAnalysis {
        kind: String,
    },
}

impl Operation {
    pub fn name(&self) -> &'static str {
        match self {
            Self::CreatePart { .. } => "create_part",
            Self::DeletePart { .. } => "delete_part",
            Self::ChangeParameter { .. } => "change_parameter",
            Self::ChangeDimension { .. } => "change_dimension",
            Self::ChangeMaterial { .. } => "change_material",
            Self::MoveComponent { .. } => "move_component",
            Self::CreateRequirement { .. } => "create_requirement",
            Self::ModifyRequirement { .. } => "modify_requirement",
            Self::CreatePort { .. } => "create_port",
            Self::CreateInterface { .. } => "create_interface",
            Self::CreateMate { .. } => "create_mate",
            Self::CreateDatum { .. } => "create_datum",
            Self::CreateSketch { .. } => "create_sketch",
            Self::Extrude { .. } => "extrude",
            Self::RunAnalysis { .. } => "run_analysis",
        }
    }

    pub fn affected(&self) -> Vec<String> {
        match self {
            Self::CreatePart { id, .. }
            | Self::DeletePart { id }
            | Self::MoveComponent { id, .. } => {
                vec![id.clone()]
            }
            Self::ChangeParameter { name, .. } => vec![name.clone()],
            Self::ChangeDimension { part, .. } | Self::ChangeMaterial { part, .. } => {
                vec![part.clone()]
            }
            Self::CreateRequirement { id, .. } | Self::ModifyRequirement { id, .. } => {
                vec![id.clone()]
            }
            Self::CreatePort { id, host, .. } => vec![id.clone(), host.clone()],
            Self::CreateInterface { id, a, b, .. } => vec![id.clone(), a.clone(), b.clone()],
            Self::CreateMate { id, interface, .. } => vec![id.clone(), interface.clone()],
            Self::CreateDatum { id, host, .. }
            | Self::CreateSketch { id, part: host, .. }
            | Self::Extrude { id, part: host, .. } => {
                vec![id.clone(), host.clone()]
            }
            Self::RunAnalysis { kind } => vec![kind.clone()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignTransaction {
    pub transaction_id: String,
    pub timestamp: String,
    pub agent_id: String,
    pub intent: String,
    pub reason: String,
    #[serde(default)]
    pub requirements: Vec<String>,
    pub operations: Vec<Operation>,
    #[serde(default)]
    pub affected_entities: Vec<String>,
    #[serde(default)]
    pub geometry_hash_before: Option<String>,
    #[serde(default)]
    pub geometry_hash_after: Option<String>,
    #[serde(default)]
    pub validation_results: Vec<serde_json::Value>,
    #[serde(default)]
    pub confidence: f32,
    pub status: TxStatus,
    pub user_decision: UserDecision,
}

#[derive(Debug, Error)]
pub enum TxError {
    #[error("illegal status transition {from:?} -> {to:?}")]
    Illegal { from: TxStatus, to: TxStatus },
    #[error("apply: {0}")]
    Apply(String),
    #[error("agent {agent} is not allowed to {op}")]
    Unauthorized { agent: String, op: String },
    #[error("COMMIT authority required")]
    CommitRequired,
}

pub fn can_transition(from: TxStatus, to: TxStatus) -> bool {
    use TxStatus::*;
    matches!(
        (from, to),
        (Proposed, Validating)
            | (Validating, Valid)
            | (Validating, Invalid)
            | (Valid, Approved)
            | (Valid, Rejected)
            | (Invalid, Rejected)
            | (Invalid, Proposed)
            | (Approved, Committed)
            | (Approved, Rejected)
            | (Committed, RolledBack)
            | (Proposed, Rejected)
    )
}

impl DesignTransaction {
    pub fn propose(agent_id: &str, intent: &str, reason: &str, ops: Vec<Operation>) -> Self {
        let affected: Vec<String> = ops.iter().flat_map(|o| o.affected()).collect();
        Self {
            transaction_id: format!("tx.{}", Uuid::new_v4().simple()),
            timestamp: Utc::now().to_rfc3339(),
            agent_id: agent_id.into(),
            intent: intent.into(),
            reason: reason.into(),
            requirements: vec![],
            operations: ops,
            affected_entities: affected,
            geometry_hash_before: None,
            geometry_hash_after: None,
            validation_results: vec![],
            confidence: 0.5,
            status: TxStatus::Proposed,
            user_decision: UserDecision::Pending,
        }
    }

    pub fn transition(&mut self, to: TxStatus) -> Result<(), TxError> {
        if !can_transition(self.status, to) {
            return Err(TxError::Illegal {
                from: self.status,
                to,
            });
        }
        self.status = to;
        Ok(())
    }
}

pub fn apply_operations(doc: &mut DesignDocument, ops: &[Operation]) -> Result<(), TxError> {
    for op in ops {
        apply_one(doc, op)?;
    }
    Ok(())
}

fn apply_one(doc: &mut DesignDocument, op: &Operation) -> Result<(), TxError> {
    match op {
        Operation::ChangeParameter { name, value, unit } => {
            if let Some(p) = doc.parameters.get_mut(name) {
                p.value = *value;
                if let Some(u) = unit {
                    p.unit = u.clone();
                }
                p.si = None;
                sync_geometry_from_parameters(doc, name);
            } else {
                return Err(TxError::Apply(format!("unknown parameter {name}")));
            }
        }
        Operation::ChangeDimension { part, field, value } => {
            let p = doc
                .part_mut(part)
                .ok_or_else(|| TxError::Apply(format!("unknown part {part}")))?;
            match (&mut p.spatial.primitive, field.as_str()) {
                (Primitive::Box { sx, .. }, "sx") => *sx = *value,
                (Primitive::Box { sy, .. }, "sy") => *sy = *value,
                (Primitive::Box { sz, .. }, "sz") => *sz = *value,
                (Primitive::Cylinder { radius, .. }, "radius") => *radius = *value,
                (Primitive::Cylinder { height, .. }, "height") => *height = *value,
                _ => return Err(TxError::Apply(format!("cannot set {field} on {part}"))),
            }
        }
        Operation::MoveComponent { id, origin_m } => {
            let p = doc
                .part_mut(id)
                .ok_or_else(|| TxError::Apply(format!("unknown part {id}")))?;
            p.spatial.origin_m = *origin_m;
        }
        Operation::DeletePart { id } => {
            doc.parts.retain(|p| p.id.as_str() != id);
        }
        Operation::CreatePart {
            id,
            name,
            parent,
            semantic_role,
            origin_m,
            primitive,
        } => {
            if doc.part(id).is_some() {
                return Err(TxError::Apply(format!("duplicate part {id}")));
            }
            doc.parts.push(Part {
                id: EntityId::new(id.clone()),
                name: name.clone(),
                parent: parent.clone().map(EntityId::new),
                system: None,
                material: None,
                semantic_role: semantic_role.clone(),
                qty: 1,
                catalog_ref: None,
                spatial: Spatial {
                    origin_m: *origin_m,
                    rpy_rad: [0.0, 0.0, 0.0],
                    primitive: primitive.clone(),
                    assembly_stage: 99,
                    explosion_vector: [0.0, 0.0, 1.0],
                    explosion_distance_m: 0.15,
                    radial_group: None,
                    parent_axis: None,
                    service_path: vec![],
                    cad: None,
                },
                provenance: Provenance::generated("transaction", "create_part"),
            });
        }
        Operation::ChangeMaterial { part, material } => {
            let p = doc
                .part_mut(part)
                .ok_or_else(|| TxError::Apply(format!("unknown part {part}")))?;
            p.material = Some(EntityId::new(material.clone()));
        }
        Operation::CreateRequirement {
            id,
            text,
            value,
            unit,
        } => {
            doc.requirements.push(Requirement {
                id: EntityId::new(id.clone()),
                text: text.clone(),
                quantity: None,
                operator: None,
                value: *value,
                unit: unit.clone(),
                acceptance: String::new(),
                satisfied: None,
                evidence: vec![],
                provenance: Provenance::generated("transaction", "create_requirement"),
            });
        }
        Operation::ModifyRequirement { id, text, value } => {
            let r = doc
                .requirements
                .iter_mut()
                .find(|r| r.id.as_str() == id)
                .ok_or_else(|| TxError::Apply(format!("unknown requirement {id}")))?;
            if let Some(t) = text {
                r.text = t.clone();
            }
            if value.is_some() {
                r.value = *value;
            }
        }
        Operation::CreatePort { .. }
        | Operation::CreateInterface { .. }
        | Operation::CreateMate { .. }
        | Operation::CreateDatum { .. }
        | Operation::CreateSketch { .. }
        | Operation::Extrude { .. }
        | Operation::RunAnalysis { .. } => {
            // Recorded on the transaction; graph inserts for these ops are Phase 2.
            // Dry-run succeeds so DTP can exercise the op names without pretending CAD history exists.
        }
    }
    Ok(())
}

fn sync_geometry_from_parameters(doc: &mut DesignDocument, name: &str) {
    let si = match doc.parameters.get(name) {
        Some(p) => p.si_value(),
        None => return,
    };
    match name {
        "upper_arm.length" => {
            if let Some(p) = doc.part_mut("part.upper_arm.tube") {
                if let Primitive::Box { sx, .. } = &mut p.spatial.primitive {
                    *sx = si;
                }
                p.spatial.origin_m[0] = si / 2.0;
                p.spatial.explosion_distance_m = si * 0.4;
            }
        }
        "forearm.length" => {
            if let Some(p) = doc.part_mut("part.forearm.tube") {
                if let Primitive::Box { sx, .. } = &mut p.spatial.primitive {
                    *sx = si;
                }
            }
        }
        "wrist.length" => {
            if let Some(p) = doc.part_mut("part.wrist.housing") {
                if let Primitive::Cylinder { height, .. } = &mut p.spatial.primitive {
                    *height = si;
                }
            }
        }
        _ => {}
    }
    relayout_arm(doc);
}

fn relayout_arm(doc: &mut DesignDocument) {
    let upper = doc
        .parameters
        .get("upper_arm.length")
        .map(|p| p.si_value())
        .unwrap_or(0.4);
    let forearm = doc
        .parameters
        .get("forearm.length")
        .map(|p| p.si_value())
        .unwrap_or(0.33);
    let wrist = doc
        .parameters
        .get("wrist.length")
        .map(|p| p.si_value())
        .unwrap_or(0.07);
    let z = 0.20;
    if let Some(p) = doc.part_mut("part.upper_arm.tube") {
        p.spatial.origin_m = [upper / 2.0, 0.0, z];
    }
    if let Some(p) = doc.part_mut("part.elbow.housing") {
        p.spatial.origin_m = [upper + 0.02, 0.0, z];
    }
    if let Some(p) = doc.part_mut("part.forearm.tube") {
        p.spatial.origin_m = [upper + 0.04 + forearm / 2.0, 0.0, z];
        if let Primitive::Box { sx, .. } = &mut p.spatial.primitive {
            *sx = forearm;
        }
    }
    if let Some(p) = doc.part_mut("part.wrist.housing") {
        p.spatial.origin_m = [upper + 0.04 + forearm + wrist / 2.0, 0.0, z];
    }
    if let Some(p) = doc.part_mut("part.ee.adapter") {
        p.spatial.origin_m = [upper + 0.04 + forearm + wrist + 0.02, 0.0, z];
    }
}

pub fn dry_run(doc: &DesignDocument, tx: &DesignTransaction) -> Result<DesignDocument, TxError> {
    let mut clone = doc.clone();
    apply_operations(&mut clone, &tx.operations)?;
    Ok(clone)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Ledger {
    pub items: Vec<DesignTransaction>,
    #[serde(default)]
    pub snapshots: BTreeMap<String, String>,
}

impl Ledger {
    pub fn push(&mut self, tx: DesignTransaction) {
        self.items.push(tx);
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut DesignTransaction> {
        self.items.iter_mut().find(|t| t.transaction_id == id)
    }

    pub fn get(&self, id: &str) -> Option<&DesignTransaction> {
        self.items.iter().find(|t| t.transaction_id == id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arm_parameter_change_is_dry_runnable() {
        let dir =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../projects/archeon-arm");
        let doc = archeon_design_ir::load_project_dir(&dir).unwrap();
        let tx = DesignTransaction::propose(
            "cad-designer",
            "Increase UpperArm length: 400 mm → 425 mm",
            "unit test",
            vec![Operation::ChangeParameter {
                name: "upper_arm.length".into(),
                value: 425.0,
                unit: Some("mm".into()),
            }],
        );
        let preview = dry_run(&doc, &tx).unwrap();
        assert!((preview.parameters["upper_arm.length"].value - 425.0).abs() < 1e-9);
        assert!((preview.derived_reach_m().unwrap() - 0.825).abs() < 1e-9);
        assert_eq!(doc.parameters["upper_arm.length"].value, 400.0);
    }

    #[test]
    fn status_machine_rejects_illegal() {
        assert!(!can_transition(TxStatus::Proposed, TxStatus::Committed));
        assert!(can_transition(TxStatus::Proposed, TxStatus::Validating));
        assert!(can_transition(TxStatus::Approved, TxStatus::Committed));
    }

    #[test]
    fn malformed_parameter_fails() {
        let mut doc = DesignDocument {
            schema_version: "0.1.0".into(),
            project: archeon_design_ir::Project {
                id: EntityId::new("project.x"),
                name: "x".into(),
                description: String::new(),
                revision_id: "rev.0001".into(),
                branch: "main".into(),
                kernel: "primitive".into(),
                domain: "mechanical".into(),
                provenance: Provenance::generated("t", "t"),
            },
            systems: vec![],
            assemblies: vec![],
            parts: vec![],
            features: vec![],
            datums: vec![],
            ports: vec![],
            interfaces: vec![],
            mates: vec![],
            constraints: vec![],
            functions: vec![],
            flows: vec![],
            loads: vec![],
            materials: vec![],
            requirements: vec![],
            analyses: vec![],
            evidence: vec![],
            decisions: vec![],
            revisions: vec![],
            parameters: Default::default(),
            assembly_sequence: vec![],
        };
        let err = apply_operations(
            &mut doc,
            &[Operation::ChangeParameter {
                name: "missing".into(),
                value: 1.0,
                unit: None,
            }],
        )
        .unwrap_err();
        assert!(matches!(err, TxError::Apply(_)));
    }
}
