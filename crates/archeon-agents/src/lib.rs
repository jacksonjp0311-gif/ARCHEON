//! Bounded agents. They propose transactions; they never write DesignIR themselves.
use archeon_assembly::ExplosionStrategy;
use archeon_design_ir::DesignDocument;
use archeon_transactions::{Authority, DesignTransaction, Operation, TxError};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub mod memory;
pub mod provider;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCard {
    pub id: String,
    pub role: String,
    pub brief: String,
    pub allowed_ops: Vec<String>,
    pub authority: Vec<Authority>,
    pub tools: Vec<String>,
}

impl AgentCard {
    pub fn may(&self, auth: Authority) -> bool {
        self.authority.contains(&auth)
    }

    pub fn allows_op(&self, op: &str) -> bool {
        self.allowed_ops.iter().any(|o| o == op || o == "*")
    }
}

pub fn roster() -> Vec<AgentCard> {
    vec![
        card("architect", "Architect", "Interpret requirements, decompose subsystems, name interfaces.", &["create_requirement", "modify_requirement", "create_interface"], &[Authority::Read, Authority::Propose], &["read_requirement", "list_parts", "create_transaction"]),
        card("cad-designer", "CAD Designer", "Parametric features and dimensions. Propose only.", &["change_parameter", "change_dimension", "create_sketch", "extrude", "create_datum"], &[Authority::Read, Authority::Propose], &["read_part", "create_transaction", "regenerate_geometry"]),
        card("assembly-designer", "Assembly Designer", "Mates, packaging, spatial relationships.", &["create_mate", "create_port", "create_interface", "move_component"], &[Authority::Read, Authority::Propose], &["list_interfaces", "create_transaction"]),
        card("constraint-engineer", "Constraint Engineer", "Dimensional and assembly constraints. Heuristic in Phase 1.", &["change_parameter"], &[Authority::Read, Authority::Propose], &["validate_transaction"]),
        card("analysis-engineer", "Analysis Engineer", "Kinematic reach (derived). No FEA in Phase 1.", &["run_analysis"], &[Authority::Read, Authority::Propose], &["calculate_distance"]),
        card("dfm", "DFM Reviewer", "Manufacturability heuristics. Not a CAM system.", &[], &[Authority::Read, Authority::Propose], &["read_part"]),
        card("components", "Components", "Standard hardware catalog abstraction. No vendor API.", &["change_material"], &[Authority::Read, Authority::Propose], &["list_parts"]),
        card("bom", "BOM", "Quantities and aggregation. Does not invent prices.", &[], &[Authority::Read], &["list_parts"]),
        card("spatial-director", "Spatial Director", "Views, explosion, isolate. Does not mutate DesignIR.", &[], &[Authority::Read], &["create_exploded_view", "focus_part"]),
        card("critic", "Critic", "Find missing requirements, impossible interfaces, unverified claims.", &[], &[Authority::Read, Authority::Propose], &["validate_transaction", "list_interfaces"]),
        card("memory-curator", "Memory Curator", "What may be remembered. Cannot mutate DesignIR.", &[], &[Authority::Read], &["read_requirement"]),
        card("operator", "Human operator", "Retains COMMIT.", &["*"], &[Authority::Read, Authority::Propose, Authority::Validate, Authority::Commit, Authority::Admin], &["*"]),
    ]
}

fn card(id: &str, role: &str, brief: &str, ops: &[&str], auth: &[Authority], tools: &[&str]) -> AgentCard {
    AgentCard {
        id: id.into(),
        role: role.into(),
        brief: brief.into(),
        allowed_ops: ops.iter().map(|s| s.to_string()).collect(),
        authority: auth.to_vec(),
        tools: tools.iter().map(|s| s.to_string()).collect(),
    }
}

pub fn card_by_id(id: &str) -> Option<AgentCard> {
    roster().into_iter().find(|c| c.id == id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub side_effects: String,
    pub authority: Authority,
}

pub fn tool_registry() -> Vec<ToolSpec> {
    let r = |name: &str, description: &str, side_effects: &str, authority: Authority| ToolSpec {
        name: name.into(),
        description: description.into(),
        side_effects: side_effects.into(),
        authority,
    };
    vec![
        r("read_requirement", "Read one requirement", "none", Authority::Read),
        r("read_part", "Read one part", "none", Authority::Read),
        r("read_interface", "Read one interface", "none", Authority::Read),
        r("list_parts", "List part ids", "none", Authority::Read),
        r("list_interfaces", "List interfaces", "none", Authority::Read),
        r("create_transaction", "Propose a design transaction", "creates PROPOSED tx", Authority::Propose),
        r("validate_transaction", "Run graph validators on a proposal", "none", Authority::Validate),
        r("regenerate_geometry", "Ask CAD worker to rebuild solids", "CAD files", Authority::Validate),
        r("calculate_distance", "Derived reach / AABB distance", "none", Authority::Read),
        r("calculate_mass", "Mass from bbox × ASSUMED density", "none", Authority::Read),
        r("check_collision", "AABB heuristic unless OCCT adapter is live", "none", Authority::Read),
        r("create_exploded_view", "Spatial command", "view only", Authority::Read),
        r("focus_part", "Spatial command", "view only", Authority::Read),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ViewCommand {
    Explode { factor: f64, strategy: ExplosionStrategy },
    Isolate { id: String },
    Select { id: String },
    Show { layer: String },
    ResetView,
    SetMode { mode: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Intent {
    View(ViewCommand),
    Propose(DesignTransaction),
    Validate { transaction_id: Option<String> },
    Commit { transaction_id: String },
    Reject { transaction_id: String },
    Chat { text: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    pub agent_id: String,
    pub text: String,
}

pub fn authorize_tx(agent_id: &str, tx: &DesignTransaction) -> Result<(), TxError> {
    let card = card_by_id(agent_id).ok_or_else(|| TxError::Unauthorized {
        agent: agent_id.into(),
        op: "unknown_agent".into(),
    })?;
    if !card.may(Authority::Propose) {
        return Err(TxError::Unauthorized {
            agent: agent_id.into(),
            op: "propose".into(),
        });
    }
    for op in &tx.operations {
        if !card.allows_op(op.name()) {
            return Err(TxError::Unauthorized {
                agent: agent_id.into(),
                op: op.name().into(),
            });
        }
    }
    Ok(())
}

pub fn authorize_commit(agent_id: &str) -> Result<(), TxError> {
    let card = card_by_id(agent_id).ok_or_else(|| TxError::Unauthorized {
        agent: agent_id.into(),
        op: "commit".into(),
    })?;
    if !card.may(Authority::Commit) {
        return Err(TxError::CommitRequired);
    }
    Ok(())
}

/// Deterministic local command parser. Works without an AI key.
pub fn parse_command(text: &str, doc: &DesignDocument) -> Parsed {
    let lower = text.trim().to_lowercase();
    let mut views = Vec::new();
    let mut notes = Vec::new();
    let mut tx: Option<DesignTransaction> = None;
    let mut action: Option<String> = None;

    if lower.contains("reset view") || lower == "reset" {
        views.push(ViewCommand::ResetView);
        notes.push("Spatial Director: reset camera / assembled.".into());
    }
    if lower.contains("explode") {
        let factor = extract_percent(&lower).unwrap_or(0.7);
        views.push(ViewCommand::Explode {
            factor,
            strategy: ExplosionStrategy::Sequence,
        });
        notes.push("Spatial Director: SEQUENCE explosion (reverse assembly order).".into());
    }
    if lower.contains("isolate") {
        if let Some(id) = resolve_part(&lower, doc) {
            views.push(ViewCommand::Isolate { id: id.clone() });
            views.push(ViewCommand::Select { id });
            notes.push("Spatial Director: isolate semantic part.".into());
        }
    }
    if lower.contains("select") {
        if let Some(id) = resolve_part(&lower, doc) {
            views.push(ViewCommand::Select { id });
        }
    }
    if lower.contains("show interface") || lower.contains("show mechanical") {
        views.push(ViewCommand::Show { layer: "interfaces".into() });
        views.push(ViewCommand::SetMode { mode: "INTERFACES".into() });
        notes.push("Spatial Director: interface markers.".into());
    }
    if lower.contains("show requirement") {
        views.push(ViewCommand::SetMode { mode: "REQUIREMENTS".into() });
        notes.push("Architect: requirements graph.".into());
    }
    if lower.contains("x-ray") || lower.contains("xray") {
        views.push(ViewCommand::SetMode { mode: "X_RAY".into() });
    }
    if lower.contains("cutaway") {
        views.push(ViewCommand::SetMode { mode: "CUTAWAY".into() });
    }
    if lower.contains("service") {
        views.push(ViewCommand::SetMode { mode: "SERVICE".into() });
        views.push(ViewCommand::Explode {
            factor: 0.85,
            strategy: ExplosionStrategy::Service,
        });
    }

    if lower.contains("increase upper arm") || lower.contains("lengthen upper") {
        let delta = extract_mm(&lower).unwrap_or(25.0);
        let current = doc
            .parameters
            .get("upper_arm.length")
            .map(|p| p.value)
            .unwrap_or(400.0);
        let next = current + delta;
        let mut proposed = DesignTransaction::propose(
            "cad-designer",
            &format!("Increase UpperArm length: {current} mm → {next} mm"),
            "Operator natural-language request. Parameter change only; no CAD kernel mutation until COMMIT.",
            vec![Operation::ChangeParameter {
                name: "upper_arm.length".into(),
                value: next,
                unit: Some("mm".into()),
            }],
        );
        proposed.requirements = vec!["req.reach".into()];
        proposed.confidence = 0.72;
        tx = Some(proposed);
        notes.push("CAD Designer: proposed change_parameter (not committed).".into());
        notes.push("Analysis Engineer: reach is DERIVED from link lengths; torque/FEA not run.".into());
        notes.push("Critic: REQ-003 cost unevaluated; catalog not connected.".into());
        views.push(ViewCommand::SetMode { mode: "AGENT_PROPOSAL".into() });
    }

    if lower.contains("validate proposal") || lower == "validate" {
        action = Some("validate".into());
        notes.push("Constraint Engineer + Critic: graph validation requested.".into());
    }
    if lower.contains("commit proposal") || lower == "commit" || lower.contains("approve") {
        action = Some("commit".into());
        notes.push("Operator COMMIT required — agents cannot self-commit.".into());
    }
    if lower.contains("reject") {
        action = Some("reject".into());
    }

    if views.is_empty() && tx.is_none() && action.is_none() {
        notes.push("No local engineering command matched. Mock provider will reply; no state change.".into());
    }

    Parsed { views, notes, tx, action }
}

#[derive(Debug, Clone)]
pub struct Parsed {
    pub views: Vec<ViewCommand>,
    pub notes: Vec<String>,
    pub tx: Option<DesignTransaction>,
    pub action: Option<String>,
}

fn extract_percent(s: &str) -> Option<f64> {
    let mut last = None;
    for w in s.split(|c: char| !c.is_ascii_digit() && c != '.') {
        if let Ok(n) = w.parse::<f64>() {
            if (1.0..101.0).contains(&n) {
                last = Some(n / 100.0);
            }
        }
    }
    last
}

fn extract_mm(s: &str) -> Option<f64> {
    let tokens: Vec<&str> = s.split_whitespace().collect();
    for i in 0..tokens.len() {
        if let Ok(n) = tokens[i].parse::<f64>() {
            return Some(n);
        }
    }
    None
}

fn resolve_part(s: &str, doc: &DesignDocument) -> Option<String> {
    let aliases = [
        ("upper arm", "part.upper_arm.tube"),
        ("forearm", "part.forearm.tube"),
        ("shoulder", "part.shoulder.housing"),
        ("elbow", "part.elbow.housing"),
        ("wrist", "part.wrist.housing"),
        ("end effector", "part.ee.adapter"),
        ("effector", "part.ee.adapter"),
        ("base", "part.base.plate"),
        ("column", "part.base.column"),
    ];
    for (k, id) in aliases {
        if s.contains(k) {
            return Some(id.into());
        }
    }
    doc.parts.iter().find(|p| s.contains(&p.name.to_lowercase())).map(|p| p.id.0.clone())
}

pub fn critic_notes(doc: &DesignDocument) -> Vec<String> {
    let mut n = Vec::new();
    if doc.derived_reach_m().unwrap_or(0.0) + 1e-9 < 0.8 {
        n.push("REQ-002 reach may fail: derived Σ(link lengths) < 800 mm.".into());
    } else {
        n.push("REQ-002: derived reach from link lengths meets 800 mm. This is DERIVED, not a measured workspace.".into());
    }
    n.push("REQ-001 payload 3 kg is a requirement. No structural analysis has been run. Capability is UNVERIFIED.".into());
    n.push("REQ-003 BOM cost: catalog adapter is not connected. No prices are invented.".into());
    let mut ports: BTreeSet<_> = doc.ports.iter().map(|p| p.id.0.clone()).collect();
    for i in &doc.interfaces {
        ports.remove(&i.a.0);
        ports.remove(&i.b.0);
    }
    if !ports.is_empty() {
        n.push(format!("Unmated ports: {}.", ports.into_iter().collect::<Vec<_>>().join(", ")));
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;
    use archeon_design_ir::{EntityId, Project};
    use archeon_provenance::Provenance;

    fn doc() -> DesignDocument {
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
            parameters: Default::default(),
            assembly_sequence: vec![],
        }
    }

    #[test]
    fn unauthorized_commit_rejected() {
        assert!(authorize_commit("cad-designer").is_err());
        assert!(authorize_commit("operator").is_ok());
    }

    #[test]
    fn cad_designer_cannot_delete() {
        let tx = DesignTransaction::propose(
            "cad-designer",
            "delete",
            "test",
            vec![Operation::DeletePart {
                id: "part.x".into(),
            }],
        );
        assert!(authorize_tx("cad-designer", &tx).is_err());
    }

    #[test]
    fn local_parser_explode() {
        let p = parse_command("explode assembly", &doc());
        assert!(matches!(p.views.first(), Some(ViewCommand::Explode { .. })));
    }
}
