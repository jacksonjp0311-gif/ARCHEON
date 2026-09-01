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
    engineering_heuristics(doc, &mut findings);
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

fn engineering_heuristics(doc: &DesignDocument, out: &mut Vec<Finding>) {
    missing_interfaces(doc, out);
    orphan_parts(doc, out);
    unsupported_feature_claims(doc, out);
    bearing_seat_mismatch(doc, out);
    shaft_bearing_mismatch(doc, out);
    missing_fasteners(doc, out);
    envelope_overlap(doc, out);
    failed_cad_hints(doc, out);
}

fn missing_interfaces(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let mut used: BTreeSet<String> = BTreeSet::new();
    for i in &doc.interfaces {
        used.insert(i.a.0.clone());
        used.insert(i.b.0.clone());
    }
    for p in &doc.ports {
        if !used.contains(&p.id.0) {
            push(
                out,
                Severity::Warning,
                "missing_interface",
                Some(p.id.as_str()),
                "port has no interface (heuristic — may be intentional service/access)",
            );
        }
    }
}

fn orphan_parts(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let child: BTreeSet<_> = doc
        .assemblies
        .iter()
        .flat_map(|a| a.children.iter().map(|c| c.0.clone()))
        .collect();
    for p in &doc.parts {
        if !child.contains(&p.id.0) {
            push(
                out,
                Severity::Warning,
                "orphan_part",
                Some(p.id.as_str()),
                "part is not listed in any assembly.children",
            );
        }
    }
}

fn unsupported_feature_claims(doc: &DesignDocument, out: &mut Vec<Finding>) {
    use archeon_design_ir::KernelGeometry;
    for f in &doc.features {
        if f.kind.kernel_geometry() == KernelGeometry::SemanticOnly {
            push(
                out,
                Severity::Info,
                "unsupported_component_feature",
                Some(f.id.as_str()),
                &format!(
                    "{:?} is stored on DesignIR; primitive kernel does not author this solid",
                    f.kind
                ),
            );
        }
    }
}

fn f64_param(f: &archeon_design_ir::Feature, keys: &[&str]) -> Option<f64> {
    for k in keys {
        if let Some(v) = f.params.get(*k) {
            if let Some(n) = v.as_f64() {
                return Some(n);
            }
        }
    }
    None
}

fn bearing_seat_mismatch(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let seats: Vec<_> = doc
        .features
        .iter()
        .filter(|f| {
            matches!(
                f.kind,
                archeon_design_ir::FeatureKind::BearingSeat | archeon_design_ir::FeatureKind::Hole
            ) && (f.semantic_role.contains("bearing")
                || f.kind == archeon_design_ir::FeatureKind::BearingSeat)
        })
        .collect();
    let bearings: Vec<_> = doc
        .parts
        .iter()
        .filter(|p| {
            p.component_class.as_deref() == Some("bearing")
                || p.semantic_role.contains("bearing")
                || p.catalog_ref.as_deref().unwrap_or("").contains("BEARING")
                || p.catalog_ref.as_deref().unwrap_or("").contains("6204")
        })
        .collect();
    for seat in seats {
        let seat_d = f64_param(seat, &["diameter_m", "bearing_od_m"]);
        for b in &bearings {
            if let archeon_design_ir::Primitive::Cylinder { radius, .. } = b.spatial.primitive {
                let od = radius * 2.0;
                if let Some(sd) = seat_d {
                    if (sd - od).abs() > 0.0006 {
                        push(
                            out,
                            Severity::Warning,
                            "bearing_seat_mismatch",
                            Some(seat.id.as_str()),
                            &format!(
                                "seat diameter {sd:.5} m vs bearing OD {od:.5} m (heuristic AABB/param, not a qualified H7/g6)"
                            ),
                        );
                    }
                }
            }
        }
    }
}

fn shaft_bearing_mismatch(doc: &DesignDocument, out: &mut Vec<Finding>) {
    let shafts: Vec<_> = doc
        .parts
        .iter()
        .filter(|p| {
            p.semantic_role.contains("shaft") || p.component_class.as_deref() == Some("shaft")
        })
        .collect();
    let bearings: Vec<_> = doc
        .parts
        .iter()
        .filter(|p| {
            p.component_class.as_deref() == Some("bearing") || p.semantic_role.contains("bearing")
        })
        .collect();
    for s in shafts {
        let journal = match s.spatial.primitive {
            archeon_design_ir::Primitive::Cylinder { radius, .. } => radius * 2.0,
            _ => continue,
        };
        for b in &bearings {
            if let Some(lib) = doc.component_library.iter().find(|c| {
                Some(c.designation.as_str()) == s.catalog_ref.as_deref()
                    || Some(c.designation.as_str()) == b.catalog_ref.as_deref()
            }) {
                if let Some(id) = lib.params.get("inner_diameter_m") {
                    if (journal - *id).abs() > 0.0006 {
                        push(
                            out,
                            Severity::Warning,
                            "shaft_bearing_mismatch",
                            Some(s.id.as_str()),
                            &format!(
                                "shaft journal {journal:.5} m vs library ID {id:.5} m — HEURISTIC, not a measured fit"
                            ),
                        );
                    }
                }
            } else if let archeon_design_ir::Primitive::Cylinder { radius, .. } =
                b.spatial.primitive
            {
                // envelope OD is not ID; skip unless catalog params exist
                let _ = radius;
            }
        }
        for fit in &doc.fit_relations {
            if fit.quantity.contains("journal") || fit.quantity.contains("shaft") {
                if (fit.a_value_m - fit.b_value_m).abs() > 0.0006
                    && fit.origin != archeon_design_ir::FitOrigin::Assumed
                {
                    // labeled mismatch with non-assumed origin
                    if (fit.a.0 == s.id.0 || fit.b.0 == s.id.0)
                        && (fit.a_value_m - journal).abs() > 0.0006
                        && (fit.b_value_m - journal).abs() > 0.0006
                    {
                        push(
                            out,
                            Severity::Warning,
                            "shaft_bearing_mismatch",
                            Some(fit.id.as_str()),
                            "fit relation values do not match shaft envelope (heuristic)",
                        );
                    }
                }
            }
        }
    }
}

fn missing_fasteners(doc: &DesignDocument, out: &mut Vec<Finding>) {
    if doc.fastener_groups.is_empty() {
        let covers = doc
            .parts
            .iter()
            .any(|p| p.semantic_role.contains("cover") || p.semantic_role.contains("flange"));
        if covers {
            push(
                out,
                Severity::Warning,
                "missing_fasteners",
                None,
                "service/cover parts exist but no FastenerGroup is recorded",
            );
        }
        return;
    }
    for g in &doc.fastener_groups {
        if g.count == 0 || g.instance_ids.is_empty() {
            push(
                out,
                Severity::Warning,
                "missing_fasteners",
                Some(g.id.as_str()),
                "fastener group has no instance parts",
            );
        }
    }
}

fn envelope_overlap(doc: &DesignDocument, out: &mut Vec<Finding>) {
    fn aabb(p: &archeon_design_ir::Part) -> ([f64; 3], [f64; 3]) {
        let bb = p.spatial.primitive.bbox_m();
        let o = p.spatial.origin_m;
        (
            [o[0] - bb[0] / 2.0, o[1] - bb[1] / 2.0, o[2] - bb[2] / 2.0],
            [o[0] + bb[0] / 2.0, o[1] + bb[1] / 2.0, o[2] + bb[2] / 2.0],
        )
    }
    fn overlap(a: ([f64; 3], [f64; 3]), b: ([f64; 3], [f64; 3])) -> bool {
        (0..3).all(|i| a.0[i] < b.1[i] && b.0[i] < a.1[i])
    }
    let fitted: BTreeSet<(String, String)> = doc
        .fit_relations
        .iter()
        .map(|f| {
            let mut k = [f.a.0.clone(), f.b.0.clone()];
            k.sort();
            (k[0].clone(), k[1].clone())
        })
        .collect();
    let same_parent_ok = |a: &archeon_design_ir::Part, b: &archeon_design_ir::Part| -> bool {
        a.parent == b.parent
            && (a.component_class.as_deref() == Some("bearing")
                || b.component_class.as_deref() == Some("bearing")
                || a.semantic_role.contains("bearing")
                || b.semantic_role.contains("bearing")
                || a.detail_tier == "instance"
                || b.detail_tier == "instance")
    };
    for (i, a) in doc.parts.iter().enumerate() {
        for b in doc.parts.iter().skip(i + 1) {
            if a.parent != b.parent {
                continue;
            }
            let mut key = [a.id.0.clone(), b.id.0.clone()];
            key.sort();
            if fitted.contains(&(key[0].clone(), key[1].clone())) || same_parent_ok(a, b) {
                continue;
            }
            if overlap(aabb(a), aabb(b)) {
                // nested designed parts (shaft through housing) are expected
                let nested = a.semantic_role.contains("housing")
                    || b.semantic_role.contains("housing")
                    || a.semantic_role.contains("shaft")
                    || b.semantic_role.contains("shaft");
                if nested {
                    continue;
                }
                push(
                    out,
                    Severity::Info,
                    "envelope_overlap",
                    Some(a.id.as_str()),
                    &format!(
                        "AABB overlap with {} — HEURISTIC envelope, not a Boolean interference",
                        b.id.as_str()
                    ),
                );
            }
        }
    }
}

fn failed_cad_hints(doc: &DesignDocument, out: &mut Vec<Finding>) {
    for p in &doc.parts {
        if let Some(cad) = &p.spatial.cad {
            if cad.note.to_lowercase().contains("fail") {
                push(
                    out,
                    Severity::Error,
                    "failed_cad_operation",
                    Some(p.id.as_str()),
                    "CAD note reports a failed operation",
                );
            }
        }
        if let archeon_design_ir::Primitive::Box { sx, sy, sz } = p.spatial.primitive {
            if sx <= 0.0 || sy <= 0.0 || sz <= 0.0 {
                push(
                    out,
                    Severity::Error,
                    "zero_thickness",
                    Some(p.id.as_str()),
                    "box envelope has a non-positive dimension",
                );
            }
        }
        if let archeon_design_ir::Primitive::Cylinder { radius, height } = p.spatial.primitive {
            if radius <= 0.0 || height <= 0.0 {
                push(
                    out,
                    Severity::Error,
                    "zero_thickness",
                    Some(p.id.as_str()),
                    "cylinder envelope has a non-positive dimension",
                );
            }
        }
    }
    for f in &doc.features {
        if doc.part(f.part.as_str()).is_none() {
            push(
                out,
                Severity::Error,
                "invalid_feature_reference",
                Some(f.id.as_str()),
                "feature.part does not exist",
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
                fidelity: Default::default(),
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
            fastener_groups: vec![],
            assembly_plans: vec![],
            fit_relations: vec![],
            component_library: vec![],
            detail_budget: vec![],
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
