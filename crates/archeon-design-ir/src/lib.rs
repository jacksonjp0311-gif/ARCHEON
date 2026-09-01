//! DesignIR — the engineering source of truth.
//!
//! The renderer, the language model, and the CAD kernel are adapters around this crate.

pub mod document;
pub mod entities;
pub mod generators;
pub mod ids;
pub mod load;

pub use document::DesignDocument;
pub use entities::*;
pub use ids::{is_semantic_id, EntityId};
pub use load::{load_project_dir, LoadError};

pub const SCHEMA_VERSION: &str = "0.1.0";
pub const PRODUCT: &str = "ARCHEON";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;
    use archeon_provenance::Provenance;

    #[test]
    fn cad_ref_defaults_are_cad_local_meters() {
        let json = r#"{"format":"stl","path":"generated/a.stl","truth":"GENERATED","note":""}"#;
        let c: CadRef = serde_json::from_str(json).unwrap();
        assert_eq!(c.coordinate_frame, "CAD_LOCAL");
        assert_eq!(c.units, "m");
        assert_eq!(c.local_origin, [0.0, 0.0, 0.0]);
        assert!(c.geometry_revision.is_empty());
        assert!(c.source.is_empty());
        let attached = CadRef::attached(
            "stl",
            "generated/a.stl",
            Some("generated/a.stl".into()),
            "GENERATED",
            "note",
            "GENERATED",
        );
        assert_eq!(attached.coordinate_frame, "CAD_LOCAL");
        assert_eq!(attached.local_origin, [0.0, 0.0, 0.0]);
        assert_eq!(attached.units, "m");
        assert_eq!(attached.source, "GENERATED");
    }

    #[test]
    fn roundtrip_minimal_document() {
        let doc = DesignDocument {
            schema_version: SCHEMA_VERSION.into(),
            project: Project {
                id: EntityId::new("project.demo"),
                name: "demo".into(),
                description: String::new(),
                revision_id: "rev.0001".into(),
                branch: "main".into(),
                kernel: "primitive".into(),
                domain: "mechanical".into(),
                fidelity: Default::default(),
                provenance: Provenance::generated("test", "unit"),
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
        };
        let json = serde_json::to_string(&doc).unwrap();
        let back: DesignDocument = serde_json::from_str(&json).unwrap();
        assert_eq!(back.project.id.as_str(), "project.demo");
        assert_eq!(back.design_hash(), doc.design_hash());
    }

    #[test]
    fn load_archeon_arm_seed() {
        let dir =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../projects/archeon-arm");
        let doc = load_project_dir(&dir).expect("load arm");
        assert!(doc.parts.len() >= 8);
        assert!(doc.interfaces.len() >= 7);
        let reach = doc.derived_reach_m().expect("reach");
        assert!((reach - 0.8).abs() < 1e-9);
        let ids = doc.all_ids();
        let set = doc.id_set();
        assert_eq!(ids.len(), set.len(), "duplicate semantic ids in seed");
    }

    #[test]
    fn duplicate_ids_are_detectable() {
        let mut doc = DesignDocument {
            schema_version: SCHEMA_VERSION.into(),
            project: Project {
                id: EntityId::new("project.demo"),
                name: "demo".into(),
                description: String::new(),
                revision_id: "rev.0001".into(),
                branch: "main".into(),
                kernel: "primitive".into(),
                domain: "mechanical".into(),
                fidelity: Default::default(),
                provenance: Provenance::generated("test", "unit"),
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
        };
        let ids = doc.all_ids();
        let set = doc.id_set();
        assert_eq!(ids.len(), set.len());
        doc.project.id = EntityId::new("project.demo");
        assert!(set.contains("project.demo"));
    }
}
