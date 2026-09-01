//! Live Design — temporary, isolated from canonical DesignIR.
//!
//! Three clocks stay decoupled: render (UI), engineering (this crate + CAD jobs),
//! agent (intent → tools → proposals). Events describe state. They do not grant authority.

use archeon_design_ir::{DesignDocument, Primitive};
use archeon_transactions::{DesignTransaction, Operation};
use archeon_validation::validate;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LiveStatus {
    Planning,
    Editing,
    Regenerating,
    Validating,
    Ready,
    Blocked,
    Approved,
    Rejected,
    Cancelled,
}

impl LiveStatus {
    pub fn terminal(self) -> bool {
        matches!(self, Self::Approved | Self::Rejected | Self::Cancelled)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveStep {
    pub n: u32,
    pub name: String,
    pub status: String,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveDesignSession {
    pub session_id: String,
    pub transaction_id: Option<String>,
    pub agent_id: String,
    pub base_revision: String,
    pub canonical_hash: String,
    pub status: LiveStatus,
    pub operations: Vec<LiveStep>,
    pub preview: Option<DesignDocument>,
    pub validation: serde_json::Value,
    pub affected_entities: Vec<String>,
    pub affected_requirements: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl LiveDesignSession {
    pub fn start(agent_id: &str, doc: &DesignDocument) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            session_id: format!("live.{}", Uuid::new_v4().simple()),
            transaction_id: None,
            agent_id: agent_id.into(),
            base_revision: doc.project.revision_id.clone(),
            canonical_hash: doc.design_hash(),
            status: LiveStatus::Planning,
            operations: vec![LiveStep {
                n: 1,
                name: "interpret requested change".into(),
                status: "WORKING".into(),
                note: None,
            }],
            preview: None,
            validation: serde_json::json!({ "ok": true, "note": "not started" }),
            affected_entities: vec![],
            affected_requirements: vec![],
            created_at: now.clone(),
            updated_at: now,
        }
    }

    pub fn attach_proposal(&mut self, tx: &DesignTransaction, preview: DesignDocument) {
        self.transaction_id = Some(tx.transaction_id.clone());
        self.affected_entities = tx.affected_entities.clone();
        self.affected_requirements = tx.requirements.clone();
        self.operations = vec![
            step(1, "interpret requested change", "COMPLETE", None),
            step(
                2,
                "modify parameter / dimension",
                "COMPLETE",
                Some(tx.intent.clone()),
            ),
            step(
                3,
                "regenerate CAD",
                "WAITING",
                Some("async job — viewport stays live".into()),
            ),
            step(
                4,
                "collision check",
                "NOT_CHECKED",
                Some("no OCCT Boolean in this build".into()),
            ),
            step(5, "graph validation", "WORKING", None),
        ];
        self.status = LiveStatus::Validating;
        let report = validate(&preview);
        self.validation = serde_json::to_value(&report).unwrap_or(serde_json::json!({}));
        self.operations[4].status = if report.ok() {
            "COMPLETE".into()
        } else {
            "BLOCKED".into()
        };
        self.status = if report.ok() {
            LiveStatus::Ready
        } else {
            LiveStatus::Blocked
        };
        self.preview = Some(preview);
        self.touch();
    }

    pub fn mark_regen(&mut self, status: &str) {
        if let Some(s) = self.operations.iter_mut().find(|o| o.n == 3) {
            s.status = status.into();
        }
        if status == "RUNNING" {
            self.status = LiveStatus::Regenerating;
        }
        if status == "COMPLETE" && self.status == LiveStatus::Regenerating {
            self.status = LiveStatus::Ready;
        }
        if status == "FAILED" {
            self.status = LiveStatus::Blocked;
        }
        self.touch();
    }

    pub fn cancel(&mut self) {
        if !self.status.terminal() {
            self.status = LiveStatus::Cancelled;
            self.touch();
        }
    }

    pub fn approve(&mut self) {
        if self.status == LiveStatus::Ready {
            self.status = LiveStatus::Approved;
            self.touch();
        }
    }

    pub fn reject(&mut self) {
        if !self.status.terminal() {
            self.status = LiveStatus::Rejected;
            self.touch();
        }
    }

    fn touch(&mut self) {
        self.updated_at = Utc::now().to_rfc3339();
    }
}

fn step(n: u32, name: &str, status: &str, note: Option<String>) -> LiveStep {
    LiveStep {
        n,
        name: name.into(),
        status: status.into(),
        note,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CadJobStatus {
    Queued,
    Running,
    Tessellating,
    Complete,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CadJob {
    pub id: String,
    pub transaction_id: Option<String>,
    pub status: CadJobStatus,
    /// Real progress only. None unless the worker reports it. Never invented.
    pub progress: Option<f64>,
    pub requested_at: String,
    pub completed_at: Option<String>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

impl CadJob {
    pub fn queued(transaction_id: Option<String>) -> Self {
        Self {
            id: format!("cad.{}", Uuid::new_v4().simple()),
            transaction_id,
            status: CadJobStatus::Queued,
            progress: None,
            requested_at: Utc::now().to_rfc3339(),
            completed_at: None,
            result: None,
            error: None,
        }
    }

    pub fn run(&mut self) {
        self.status = CadJobStatus::Running;
        self.progress = None;
    }

    pub fn complete(&mut self, result: serde_json::Value) {
        self.status = CadJobStatus::Complete;
        self.result = Some(result);
        self.completed_at = Some(Utc::now().to_rfc3339());
    }

    pub fn fail(&mut self, error: String) {
        self.status = CadJobStatus::Failed;
        self.error = Some(error);
        self.completed_at = Some(Utc::now().to_rfc3339());
    }

    pub fn cancel(&mut self) {
        if !matches!(self.status, CadJobStatus::Complete | CadJobStatus::Failed) {
            self.status = CadJobStatus::Cancelled;
            self.completed_at = Some(Utc::now().to_rfc3339());
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometryIdentity {
    pub entity_id: String,
    pub design_revision: String,
    pub geometry_revision: String,
    pub source: String,
}

pub fn geometry_identity(
    entity_id: &str,
    design_revision: &str,
    geometry_rev: u32,
    source: &str,
) -> GeometryIdentity {
    GeometryIdentity {
        entity_id: entity_id.into(),
        design_revision: design_revision.into(),
        geometry_revision: format!("geom.{design_revision}.{geometry_rev}"),
        source: source.into(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Variant {
    pub id: String,
    pub label: String,
    pub base_revision: String,
    pub originating_transaction: Option<String>,
    pub agent: String,
    pub preview: DesignDocument,
    pub geometry_refs: Vec<GeometryIdentity>,
    pub requirement_results: Vec<String>,
    pub validation_results: serde_json::Value,
    pub metrics: VariantMetrics,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariantMetrics {
    pub reach_m: Option<f64>,
    pub changed_parameters: Vec<String>,
    pub note: String,
}

pub fn variant_from_ops(
    label: &str,
    agent: &str,
    base: &DesignDocument,
    ops: Vec<Operation>,
) -> Result<Variant, String> {
    let tx = DesignTransaction::propose(
        agent,
        &format!("Variant {label}"),
        "Live Design alternative. Not committed.",
        ops,
    );
    let preview = archeon_transactions::dry_run(base, &tx).map_err(|e| e.to_string())?;
    let report = validate(&preview);
    let reach = preview.derived_reach_m();
    Ok(Variant {
        id: label.into(),
        label: label.into(),
        base_revision: base.project.revision_id.clone(),
        originating_transaction: Some(tx.transaction_id),
        agent: agent.into(),
        geometry_refs: preview
            .parts
            .iter()
            .map(|p| {
                geometry_identity(
                    p.id.as_str(),
                    &base.project.revision_id,
                    0,
                    "PREVIEW_PRIMITIVE",
                )
            })
            .collect(),
        requirement_results: tx.requirements.clone(),
        validation_results: serde_json::to_value(&report).unwrap_or(serde_json::json!({})),
        metrics: VariantMetrics {
            reach_m: reach,
            changed_parameters: tx.affected_entities.clone(),
            note: "Envelope preview from DesignIR parameters. Not exact BREP.".into(),
        },
        preview,
        status: if report.ok() {
            "READY".into()
        } else {
            "INVALID".into()
        },
    })
}

/// Three upper-arm length alternatives. Wrist-named requests still use a real parameter if present.
pub fn three_length_variants(
    base: &DesignDocument,
    param: &str,
    deltas_mm: [f64; 3],
) -> Result<Vec<Variant>, String> {
    let current = base
        .parameters
        .get(param)
        .map(|p| p.value)
        .ok_or_else(|| format!("unknown parameter {param}"))?;
    let labels = ["A", "B", "C"];
    let mut out = Vec::new();
    for (i, d) in deltas_mm.iter().enumerate() {
        let ops = vec![Operation::ChangeParameter {
            name: param.into(),
            value: current + *d,
            unit: Some("mm".into()),
        }];
        out.push(variant_from_ops(labels[i], "cad-designer", base, ops)?);
    }
    Ok(out)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackedChange {
    pub id: String,
    pub kind: String,
    pub summary: String,
}

pub fn tracked_deltas(
    tracked: &[String],
    canonical: &DesignDocument,
    preview: &DesignDocument,
) -> Vec<TrackedChange> {
    let mut out = Vec::new();
    for id in tracked {
        if let (Some(a), Some(b)) = (canonical.part(id), preview.part(id)) {
            let same_prim =
                format!("{:?}", a.spatial.primitive) == format!("{:?}", b.spatial.primitive);
            let same_origin = a.spatial.origin_m == b.spatial.origin_m;
            if !same_prim || !same_origin {
                out.push(TrackedChange {
                    id: id.clone(),
                    kind: "PART".into(),
                    summary: primitive_delta(&a.spatial.primitive, &b.spatial.primitive),
                });
            }
        }
        if id.starts_with("req.") {
            let ar = canonical.requirements.iter().find(|r| r.id.as_str() == id);
            let br = preview.requirements.iter().find(|r| r.id.as_str() == id);
            if ar.map(|r| r.satisfied) != br.map(|r| r.satisfied) {
                out.push(TrackedChange {
                    id: id.clone(),
                    kind: "REQUIREMENT".into(),
                    summary: "satisfaction may change under proposal (graph only)".into(),
                });
            }
        }
    }
    out
}

fn primitive_delta(a: &Primitive, b: &Primitive) -> String {
    match (a, b) {
        (Primitive::Box { sx: ax, .. }, Primitive::Box { sx: bx, .. })
            if (ax - bx).abs() > 1e-9 =>
        {
            format!("length {:.3} → {:.3} m (primitive envelope)", ax, bx)
        }
        (Primitive::Cylinder { radius: ar, .. }, Primitive::Cylinder { radius: br, .. })
            if (ar - br).abs() > 1e-9 =>
        {
            format!("radius {:.4} → {:.4} m (primitive envelope)", ar, br)
        }
        _ => "spatial envelope changed (PREVIEW)".into(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineeringEvent {
    pub event_id: String,
    pub timestamp: String,
    pub kind: String,
    #[serde(default)]
    pub entity_ids: Vec<String>,
    #[serde(default)]
    pub transaction_id: Option<String>,
    #[serde(default)]
    pub agent_id: Option<String>,
    pub payload: serde_json::Value,
}

impl EngineeringEvent {
    pub fn new(kind: &str, payload: serde_json::Value) -> Self {
        Self {
            event_id: format!("ev.{}", Uuid::new_v4().simple()),
            timestamp: Utc::now().to_rfc3339(),
            kind: kind.into(),
            entity_ids: vec![],
            transaction_id: None,
            agent_id: None,
            payload,
        }
    }
}

pub fn pick_heuristic_best(variants: &[Variant], reach_target_m: f64) -> Option<String> {
    if variants.is_empty() {
        return None;
    }
    let mut best = &variants[0];
    let mut best_score = f64::MAX;
    for v in variants {
        let r = v.metrics.reach_m.unwrap_or(0.0);
        let score = if r + 1e-9 < reach_target_m {
            1000.0 + (reach_target_m - r)
        } else {
            r - reach_target_m
        };
        if score < best_score {
            best_score = score;
            best = v;
        }
    }
    Some(best.id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use archeon_design_ir::{EntityId, Project};
    use archeon_provenance::Provenance;
    use archeon_transactions::dry_run;
    use std::collections::BTreeMap;

    fn empty_doc() -> DesignDocument {
        DesignDocument {
            schema_version: "0.1.0".into(),
            project: Project {
                id: EntityId::new("project.x"),
                name: "x".into(),
                description: String::new(),
                revision_id: "rev.0001".into(),
                branch: "main".into(),
                kernel: "primitive".into(),
                domain: "robotics".into(),
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
            parameters: BTreeMap::new(),
            assembly_sequence: vec![],
        }
    }

    #[test]
    fn session_does_not_mutate_canonical() {
        let doc = empty_doc();
        let hash = doc.design_hash();
        let mut live = LiveDesignSession::start("cad-designer", &doc);
        live.cancel();
        assert_eq!(doc.design_hash(), hash);
        assert_eq!(live.status, LiveStatus::Cancelled);
        assert_eq!(live.canonical_hash, hash);
    }

    #[test]
    fn cancel_drops_preview_authority() {
        let doc = empty_doc();
        let mut live = LiveDesignSession::start("cad-designer", &doc);
        live.cancel();
        assert!(live.status.terminal());
        assert!(live.preview.is_none());
    }

    #[test]
    fn cad_job_transitions() {
        let mut job = CadJob::queued(None);
        assert_eq!(job.status, CadJobStatus::Queued);
        assert!(job.progress.is_none());
        job.run();
        assert_eq!(job.status, CadJobStatus::Running);
        job.complete(serde_json::json!({"ok": true}));
        assert_eq!(job.status, CadJobStatus::Complete);
        let mut failed = CadJob::queued(None);
        failed.run();
        failed.fail("worker offline".into());
        assert_eq!(failed.status, CadJobStatus::Failed);
    }

    #[test]
    fn geometry_revision_identity() {
        let g = geometry_identity("part.upper_arm.tube", "rev.0001", 2, "BREP_TESSELLATION");
        assert_eq!(g.geometry_revision, "geom.rev.0001.2");
        assert_eq!(g.source, "BREP_TESSELLATION");
    }

    #[test]
    fn approve_session_is_not_a_commit() {
        let doc = empty_doc();
        let mut live = LiveDesignSession::start("operator", &doc);
        live.status = LiveStatus::Ready;
        live.approve();
        assert_eq!(live.status, LiveStatus::Approved);
        assert_eq!(doc.project.revision_id, "rev.0001");
    }

    #[test]
    fn variants_are_isolated_from_canonical() {
        let dir =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../projects/archeon-arm");
        let doc = archeon_design_ir::load_project_dir(&dir).expect("arm seed");
        let hash = doc.design_hash();
        let vars =
            three_length_variants(&doc, "upper_arm.length", [25.0, 50.0, 75.0]).expect("variants");
        assert_eq!(vars.len(), 3);
        assert_eq!(doc.design_hash(), hash);
        let ra = vars[0].metrics.reach_m.unwrap();
        let rb = vars[1].metrics.reach_m.unwrap();
        assert!(rb > ra);
        assert_eq!(pick_heuristic_best(&vars, 0.8).as_deref(), Some("A"));
    }

    #[test]
    fn tracked_entity_change_detection() {
        let dir =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../projects/archeon-arm");
        let doc = archeon_design_ir::load_project_dir(&dir).expect("arm seed");
        let vars = three_length_variants(&doc, "upper_arm.length", [50.0, 50.0, 50.0]).expect("v");
        let deltas = tracked_deltas(&["part.upper_arm.tube".into()], &doc, &vars[0].preview);
        assert!(deltas.iter().any(|d| d.id == "part.upper_arm.tube"));
    }

    #[test]
    fn dry_run_does_not_commit() {
        let dir =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../projects/archeon-arm");
        let doc = archeon_design_ir::load_project_dir(&dir).expect("arm seed");
        let hash = doc.design_hash();
        let tx = DesignTransaction::propose(
            "cad-designer",
            "preview",
            "test",
            vec![Operation::ChangeParameter {
                name: "upper_arm.length".into(),
                value: 450.0,
                unit: Some("mm".into()),
            }],
        );
        let preview = dry_run(&doc, &tx).unwrap();
        assert!((preview.parameters["upper_arm.length"].value - 450.0).abs() < 1e-9);
        assert_eq!(doc.design_hash(), hash);
    }
}
