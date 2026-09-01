//! Graph validators. These do not run FEA, collision, or manufacturing simulation.
use archeon_design_ir::{is_semantic_id, DesignDocument};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Severity {
    Info,
    Warning,
    Error,
    Fatal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub severity: Severity,
    pub code: String,
    #[serde(default)]
    pub entity: Option<String>,
    pub message: String,
    #[serde(default)]
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Report {
    pub findings: Vec<Finding>,
    pub error_count: usize,
    pub warning_count: usize,
}

impl Report {
    pub fn ok(&self) -> bool {
        self.error_count == 0 && !self.findings.iter().any(|f| f.severity == Severity::Fatal)
    }
}

pub fn validate(doc: &DesignDocument) -> Report {
    let mut findings = Vec::new();
    duplicate_ids(doc, &mut findings);
    semantic_ids(doc, &mut findings);
    missing_parents(doc, &mut findings);
    missing_part_refs(doc, &mut findings);
    interface_endpoints(doc, &mut findings);
    mate_refs(doc, &mut findings);
    orphan_features(doc, &mut findings);
    requirement_refs(doc, &mut findings);
    let error_count = findings
        .iter()
        .filter(|f| matches!(f.severity, Severity::Error | Severity::Fatal))
        .count();
    let warning_count = findings
        .iter()
        .filter(|f| f.severity == Severity::Warning)
        .count();
    Report {
        findings,
        error_count,
        warning_count,
    }
}

fn push(
    out: &mut Vec<Finding>,
    severity: Severity,
    code: &str,
    entity: Option<&str>,
    message: &str,
) {
    out.push(Finding {
        severity,
        code: code.into(),
        entity: entity.map(|s| s.into()),
        message: message.into(),
        evidence: "DesignIR graph walk".into(),
    });
}

fn duplicate_ids(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let mut seen: BTreeMap<String, u32> = BTreeMap::new();
    for id in doc.all_ids() {
        *seen.entry(id.0).or_insert(0) += 1;
    }
    for (id, n) in seen {
        if n > 1 {
            push(
                out,
                Severity::Error,
                "duplicate_semantic_id",
                Some(&id),
                &format!("id occurs {n} times"),
            );
        }
    }
}

fn semantic_ids(doc: &DesignDocument, out: &mut Vec<Finding>) {
    for id in doc.all_ids() {
        if !is_semantic_id(id.as_str()) {
            push(
                out,
                Severity::Warning,
                "non_semantic_id",
                Some(id.as_str()),
                "prefer dotted lowercase semantic ids",
            );
        }
    }
}

fn missing_parents(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let ids = doc.id_set();
    for a in &doc.assemblies {
        if let Some(p) = &a.parent {
            if !ids.contains(&p.0) {
                push(
                    out,
                    Severity::Error,
                    "missing_parent_assembly",
                    Some(a.id.as_str()),
                    &format!("parent {} missing", p.0),
                );
            }
        }
    }
    for p in &doc.parts {
        if let Some(parent) = &p.parent {
            if !ids.contains(&parent.0) {
                push(
                    out,
                    Severity::Error,
                    "missing_parent_assembly",
                    Some(p.id.as_str()),
                    &format!("parent {} missing", parent.0),
                );
            }
        }
    }
}

fn missing_part_refs(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let parts: BTreeSet<_> = doc.parts.iter().map(|p| p.id.0.clone()).collect();
    let mats: BTreeSet<_> = doc.materials.iter().map(|m| m.id.0.clone()).collect();
    for p in &doc.parts {
        if let Some(m) = &p.material {
            if !mats.contains(&m.0) {
                push(
                    out,
                    Severity::Error,
                    "missing_part_reference",
                    Some(p.id.as_str()),
                    &format!("material {} missing", m.0),
                );
            }
        }
    }
    for f in &doc.features {
        if !parts.contains(&f.part.0) {
            push(
                out,
                Severity::Error,
                "missing_part_reference",
                Some(f.id.as_str()),
                &format!("part {} missing", f.part.0),
            );
        }
    }
}

fn interface_endpoints(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let ports: BTreeSet<_> = doc.ports.iter().map(|p| p.id.0.clone()).collect();
    for i in &doc.interfaces {
        if !ports.contains(&i.a.0) {
            push(
                out,
                Severity::Error,
                "missing_interface_endpoint",
                Some(i.id.as_str()),
                &format!("port {} missing", i.a.0),
            );
        }
        if !ports.contains(&i.b.0) {
            push(
                out,
                Severity::Error,
                "missing_interface_endpoint",
                Some(i.id.as_str()),
                &format!("port {} missing", i.b.0),
            );
        }
    }
}

fn mate_refs(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let ifaces: BTreeSet<_> = doc.interfaces.iter().map(|i| i.id.0.clone()).collect();
    for m in &doc.mates {
        if !ifaces.contains(&m.interface.0) {
            push(
                out,
                Severity::Error,
                "invalid_mate_reference",
                Some(m.id.as_str()),
                &format!("interface {} missing", m.interface.0),
            );
        }
    }
}

fn orphan_features(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let parts: BTreeSet<_> = doc.parts.iter().map(|p| p.id.0.clone()).collect();
    for f in &doc.features {
        if !parts.contains(&f.part.0) {
            push(
                out,
                Severity::Error,
                "orphan_feature",
                Some(f.id.as_str()),
                "feature has no part",
            );
        }
    }
}

fn requirement_refs(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let reqs: BTreeSet<_> = doc.requirements.iter().map(|r| r.id.0.clone()).collect();
    for p in &doc.parts {
        for rid in &p.provenance.requirement_ids {
            if !reqs.contains(rid) {
                push(
                    out,
                    Severity::Error,
                    "unknown_requirement_reference",
                    Some(p.id.as_str()),
                    &format!("requirement {rid} missing"),
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use archeon_design_ir::{EntityId, Feature, FeatureKind, Project};
    use archeon_provenance::Provenance;

    fn empty() -> DesignDocument {
        DesignDocument {
            schema_version: "0.1.0".into(),
            project: Project {
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
        }
    }

    #[test]
    fn archeon_arm_has_no_graph_errors() {
        let dir =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../projects/archeon-arm");
        let doc = archeon_design_ir::load_project_dir(&dir).unwrap();
        let r = validate(&doc);
        assert_eq!(r.error_count, 0, "{:?}", r.findings);
    }

    #[test]
    fn duplicate_detection() {
        let mut doc = empty();
        doc.project.id = EntityId::new("project.x");
        // systems with same id as project
        doc.systems.push(archeon_design_ir::System {
            id: EntityId::new("project.x"),
            name: "dup".into(),
            parent: None,
            provenance: Provenance::generated("t", "t"),
        });
        let r = validate(&doc);
        assert!(r.findings.iter().any(|f| f.code == "duplicate_semantic_id"));
    }

    #[test]
    fn orphan_feature_detection() {
        let mut doc = empty();
        doc.features.push(Feature {
            id: EntityId::new("feat.ghost"),
            part: EntityId::new("part.missing"),
            kind: FeatureKind::Box,
            semantic_role: "body".into(),
            params: Default::default(),
            provenance: Provenance::generated("t", "t"),
        });
        let r = validate(&doc);
        assert!(r
            .findings
            .iter()
            .any(|f| f.code == "orphan_feature" || f.code == "missing_part_reference"));
    }
}
