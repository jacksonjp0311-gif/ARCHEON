//! Deterministic, mechanism-agnostic DesignIR graph queries.
use archeon_design_ir::{DesignDocument, GeometryClass, Joint, LocalFrame};
use archeon_provenance::ProvenanceClass;
use std::collections::BTreeSet;

pub fn get_selected_entity(selected: Option<&str>) -> Option<String> {
    selected.map(str::to_owned)
}

pub fn get_parent_assembly(doc: &DesignDocument, id: &str) -> Option<String> {
    if let Some(part) = doc.part(id) {
        return part.parent.as_ref().map(|id| id.0.clone());
    }
    doc.assemblies
        .iter()
        .find(|assembly| assembly.id.as_str() == id)
        .and_then(|assembly| assembly.parent.as_ref())
        .map(|id| id.0.clone())
}

pub fn get_child_parts(doc: &DesignDocument, id: &str) -> Vec<String> {
    doc.parts
        .iter()
        .filter(|part| {
            part.parent
                .as_ref()
                .is_some_and(|parent| parent.as_str() == id)
        })
        .map(|part| part.id.0.clone())
        .collect()
}

pub fn get_joint_chain(doc: &DesignDocument, id: &str) -> Vec<String> {
    let members: BTreeSet<_> = get_child_parts(doc, id).into_iter().collect();
    doc.joints
        .iter()
        .filter(|joint| {
            joint.id.as_str() == id
                || joint.parent.as_str() == id
                || joint.child.as_str() == id
                || joint
                    .rotating_group
                    .iter()
                    .any(|member| member.as_str() == id)
                || joint.load_path.iter().any(|member| member.as_str() == id)
                || joint
                    .rotating_group
                    .iter()
                    .chain(&joint.load_path)
                    .any(|member| members.contains(member.as_str()))
        })
        .map(|joint| joint.id.0.clone())
        .collect()
}

pub fn joint_for_context<'a>(doc: &'a DesignDocument, id: &str) -> Option<&'a Joint> {
    let members: BTreeSet<_> = get_child_parts(doc, id).into_iter().collect();
    doc.joints.iter().find(|joint| {
        joint.id.as_str() == id
            || joint.parent.as_str() == id
            || joint.child.as_str() == id
            || joint
                .rotating_group
                .iter()
                .any(|member| member.as_str() == id)
            || joint.load_path.iter().any(|member| member.as_str() == id)
            || joint
                .rotating_group
                .iter()
                .chain(&joint.load_path)
                .any(|member| members.contains(member.as_str()))
    })
}

pub fn get_interface_neighbors(doc: &DesignDocument, id: &str) -> Vec<String> {
    let mut hosts = BTreeSet::new();
    hosts.insert(id.to_owned());
    hosts.extend(get_child_parts(doc, id));
    let port_ids: BTreeSet<_> = doc
        .ports
        .iter()
        .filter(|port| hosts.contains(port.host.as_str()) || port.id.as_str() == id)
        .map(|port| port.id.0.clone())
        .collect();
    let mut result = BTreeSet::new();
    for interface in &doc.interfaces {
        if interface.id.as_str() == id
            || port_ids.contains(interface.a.as_str())
            || port_ids.contains(interface.b.as_str())
        {
            result.insert(interface.id.0.clone());
            for endpoint in [&interface.a, &interface.b] {
                if let Some(port) = doc.ports.iter().find(|port| port.id == *endpoint) {
                    result.insert(port.id.0.clone());
                    result.insert(port.host.0.clone());
                }
            }
        }
    }
    result.remove(id);
    result.into_iter().collect()
}

pub fn get_load_path(doc: &DesignDocument, id: &str) -> Vec<String> {
    joint_for_context(doc, id)
        .map(|joint| {
            joint
                .load_path
                .iter()
                .map(|entity| entity.0.clone())
                .collect()
        })
        .unwrap_or_else(|| {
            doc.loads
                .iter()
                .filter(|load| load.target.as_str() == id)
                .map(|load| load.id.0.clone())
                .collect()
        })
}

pub fn get_rotating_group(doc: &DesignDocument, id: &str) -> Vec<String> {
    joint_for_context(doc, id)
        .map(|joint| {
            joint
                .rotating_group
                .iter()
                .map(|entity| entity.0.clone())
                .collect()
        })
        .unwrap_or_default()
}

pub fn get_service_group(doc: &DesignDocument, id: &str) -> Vec<String> {
    let scope = get_parent_assembly(doc, id).unwrap_or_else(|| id.to_owned());
    doc.parts
        .iter()
        .filter(|part| {
            part.parent
                .as_ref()
                .is_some_and(|parent| parent.as_str() == scope)
                && (part.semantic_role.contains("service")
                    || part.semantic_role.contains("cover")
                    || !part.spatial.service_path.is_empty())
        })
        .map(|part| part.id.0.clone())
        .collect()
}

pub fn get_feature_graph(doc: &DesignDocument, id: &str) -> Vec<String> {
    let hosts: BTreeSet<_> = if doc.assemblies.iter().any(|a| a.id.as_str() == id) {
        get_child_parts(doc, id).into_iter().collect()
    } else {
        [id.to_owned()].into_iter().collect()
    };
    doc.features
        .iter()
        .filter(|feature| hosts.contains(feature.part.as_str()))
        .map(|feature| feature.id.0.clone())
        .collect()
}

pub fn get_requirements(doc: &DesignDocument, id: &str) -> Vec<String> {
    let mut ids = BTreeSet::new();
    let mut add = |values: &[String]| ids.extend(values.iter().cloned());
    if let Some(part) = doc.part(id) {
        add(&part.provenance.requirement_ids);
    }
    if let Some(assembly) = doc.assemblies.iter().find(|a| a.id.as_str() == id) {
        add(&assembly.provenance.requirement_ids);
    }
    if let Some(joint) = joint_for_context(doc, id) {
        add(&joint.provenance.requirement_ids);
    }
    ids.into_iter().collect()
}

pub fn get_assumptions(doc: &DesignDocument, scope: Option<&str>) -> Vec<String> {
    get_entities_by_provenance(doc, scope, ProvenanceClass::Assumed)
}

pub fn get_unverified_entities(doc: &DesignDocument, scope: Option<&str>) -> Vec<String> {
    get_entities_by_provenance(doc, scope, ProvenanceClass::Unverified)
}

fn get_entities_by_provenance(
    doc: &DesignDocument,
    scope: Option<&str>,
    class: ProvenanceClass,
) -> Vec<String> {
    let scoped_parts: BTreeSet<_> = scope
        .map(|id| {
            get_child_parts(doc, id)
                .into_iter()
                .chain([id.to_owned()])
                .collect()
        })
        .unwrap_or_default();
    let accepts = |id: &str| scope.is_none() || scoped_parts.contains(id);
    let mut found = Vec::new();
    found.extend(
        doc.parts
            .iter()
            .filter(|entity| entity.provenance.class == class && accepts(entity.id.as_str()))
            .map(|entity| entity.id.0.clone()),
    );
    found.extend(
        doc.joints
            .iter()
            .filter(|entity| {
                entity.provenance.class == class
                    && (scope.is_none()
                        || accepts(entity.id.as_str())
                        || accepts(entity.parent.as_str())
                        || accepts(entity.child.as_str()))
            })
            .map(|entity| entity.id.0.clone()),
    );
    found.extend(
        doc.requirements
            .iter()
            .filter(|entity| entity.provenance.class == class && scope.is_none())
            .map(|entity| entity.id.0.clone()),
    );
    found
}

pub fn get_mates(doc: &DesignDocument, id: &str) -> Vec<String> {
    let interfaces: BTreeSet<_> = get_interface_neighbors(doc, id).into_iter().collect();
    doc.mates
        .iter()
        .filter(|mate| mate.id.as_str() == id || interfaces.contains(mate.interface.as_str()))
        .map(|mate| mate.id.0.clone())
        .collect()
}

pub fn get_dof(doc: &DesignDocument, id: &str) -> Option<u8> {
    joint_for_context(doc, id).map(Joint::dof)
}

pub fn get_local_frame(doc: &DesignDocument, id: &str) -> Option<LocalFrame> {
    if let Some(feature) = doc
        .features
        .iter()
        .find(|feature| feature.id.as_str() == id)
    {
        return Some(feature.frame.local.clone());
    }
    if let Some(joint) = joint_for_context(doc, id) {
        return Some(joint.parent_frame.clone());
    }
    doc.datums
        .iter()
        .find(|datum| datum.id.as_str() == id)
        .map(|datum| LocalFrame {
            origin_m: datum.origin_m,
            rpy_rad: [0.0; 3],
            axis: datum.axis,
        })
}

pub fn get_geometry_status(doc: &DesignDocument, id: &str) -> GeometryClass {
    doc.part(id)
        .and_then(|part| part.spatial.cad.as_ref())
        .map(|cad| cad.geometry_class)
        .unwrap_or(GeometryClass::PrimitiveFallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn elbow_graph_uses_first_class_joint() {
        let dir =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../projects/archeon-arm");
        let doc = archeon_design_ir::load_project_dir(&dir).unwrap();
        assert_eq!(get_dof(&doc, "asm.elbow"), Some(1));
        assert!(get_joint_chain(&doc, "asm.elbow").contains(&"joint.j3".into()));
        assert!(get_rotating_group(&doc, "asm.elbow").contains(&"asm.forearm".into()));
        assert!(!get_load_path(&doc, "asm.elbow").is_empty());
    }
}
