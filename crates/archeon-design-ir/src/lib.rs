//! DesignIR — the engineering source of truth.
//!
//! The renderer, the language model, and the CAD kernel are adapters around this crate.

pub mod document;
pub mod entities;
pub mod generators;
pub mod ids;
pub mod load;
pub mod save;

pub use document::DesignDocument;
pub use entities::*;
pub use ids::{is_semantic_id, EntityId};
pub use load::{load_project_dir, LoadError};
pub use save::save_project_dir;

pub const SCHEMA_VERSION: &str = "0.6.0";
pub const CANONICAL_SCHEMA: &str = include_str!("../../../schema/design-ir.schema.json");
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
        assert_eq!(c.up_axis, "Z");
        assert_eq!(c.handedness, "RIGHT_HANDED");
        assert_eq!(c.forward_axis, "X");
        assert_eq!(attached.up_axis, "Z");
        assert_eq!(attached.handedness, "RIGHT_HANDED");
        assert_eq!(attached.forward_axis, "X");
        assert_eq!(attached.geometry_class, GeometryClass::GeneratedPreview);
        let mesh = CadRef::attached("stl", "cad/scan.stl", None, "SOURCE", "scan", "SOURCE");
        assert_eq!(mesh.geometry_class, GeometryClass::SourceMesh);
        let brep = CadRef::attached(
            "step",
            "cad/source.step",
            Some("cad/source.stl".into()),
            "SOURCE",
            "source",
            "SOURCE",
        );
        assert_eq!(brep.geometry_class, GeometryClass::ExactBrep);
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
            joints: vec![],
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
        assert!(doc.joints.len() >= 5);
        let elbow = doc.joint("joint.j3").expect("first-class elbow joint");
        assert_eq!(elbow.joint_type, JointType::Revolute);
        assert_eq!(elbow.dof(), 1);
        assert_eq!(elbow.axis, [0.0, 1.0, 0.0]);
        assert!(doc.features.iter().all(|feature| {
            feature.frame.host.as_ref() == Some(&feature.part)
                && feature
                    .frame
                    .local
                    .axis
                    .iter()
                    .any(|value| value.abs() > 0.0)
        }));
        let reach = doc.derived_reach_m().expect("reach");
        assert!((reach - 0.8).abs() < 1e-9);
        let ids = doc.all_ids();
        let set = doc.id_set();
        assert_eq!(ids.len(), set.len(), "duplicate semantic ids in seed");
    }

    #[test]
    fn canonical_schema_covers_required_transport_entities() {
        let schema: serde_json::Value = serde_json::from_str(CANONICAL_SCHEMA).unwrap();
        let entities = schema["entities"].as_object().unwrap();
        for required in [
            "Part",
            "Assembly",
            "Feature",
            "Datum",
            "Port",
            "Interface",
            "Mate",
            "Joint",
            "Constraint",
            "Requirement",
            "Analysis",
            "Evidence",
            "Decision",
            "Revision",
            "FitRelation",
            "FastenerGroup",
            "AssemblyPlan",
            "Material",
            "Load",
            "Flow",
            "CadRef",
            "Provenance",
        ] {
            assert!(entities.contains_key(required), "schema missing {required}");
        }
        assert_eq!(schema["schema_version"], "0.6.0");
    }

    #[test]
    fn feature_frame_transform_uses_shared_rpy_convention() {
        let frame = LocalFrame {
            origin_m: [0.01, 0.02, 0.03],
            rpy_rad: [std::f64::consts::FRAC_PI_2, 0.0, 0.0],
            axis: [0.0, 0.0, 1.0],
        };
        let axis = frame.axis_in_parent();
        assert!(axis[0].abs() < 1e-12);
        assert!((axis[1] + 1.0).abs() < 1e-12);
        assert!(axis[2].abs() < 1e-12);
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
            joints: vec![],
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
