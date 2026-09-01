use crate::document::DesignDocument;
use crate::entities::*;
use serde_json::Value;
use std::fs;
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LoadError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json {path}: {source}")]
    Json {
        path: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("{0}")]
    Other(String),
}

fn read_json(path: &Path) -> Result<Value, LoadError> {
    let raw = fs::read_to_string(path)?;
    serde_json::from_str(&raw).map_err(|source| LoadError::Json {
        path: path.display().to_string(),
        source,
    })
}

fn parse<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, LoadError> {
    let raw = fs::read_to_string(path)?;
    serde_json::from_str(&raw).map_err(|source| LoadError::Json {
        path: path.display().to_string(),
        source,
    })
}

/// Load a canonical project directory. Missing optional files become empty lists.
pub fn load_project_dir(dir: &Path) -> Result<DesignDocument, LoadError> {
    let project: Project = parse(&dir.join("project.json"))?;
    let mut doc = DesignDocument {
        schema_version: "0.1.0".into(),
        project,
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

    if dir.join("requirements.json").exists() {
        let v = read_json(&dir.join("requirements.json"))?;
        doc.requirements = take_array(&v, "requirements")?;
    }
    if dir.join("assemblies.json").exists() {
        let v = read_json(&dir.join("assemblies.json"))?;
        doc.assemblies = take_array(&v, "assemblies")?;
        doc.systems = take_array(&v, "systems").unwrap_or_default();
    }
    if dir.join("parts.json").exists() {
        let v = read_json(&dir.join("parts.json"))?;
        doc.parts = take_array(&v, "parts")?;
    }
    if dir.join("interfaces.json").exists() {
        let v = read_json(&dir.join("interfaces.json"))?;
        doc.interfaces = take_array(&v, "interfaces")?;
        doc.ports = take_array(&v, "ports").unwrap_or_default();
        doc.mates = take_array(&v, "mates").unwrap_or_default();
    }
    if dir.join("features.json").exists() {
        let v = read_json(&dir.join("features.json"))?;
        doc.features = take_array(&v, "features")?;
        doc.datums = take_array(&v, "datums").unwrap_or_default();
        doc.constraints = take_array(&v, "constraints").unwrap_or_default();
    }
    if dir.join("materials.json").exists() {
        let v = read_json(&dir.join("materials.json"))?;
        doc.materials = take_array(&v, "materials")?;
        doc.loads = take_array(&v, "loads").unwrap_or_default();
        doc.functions = take_array(&v, "functions").unwrap_or_default();
        doc.flows = take_array(&v, "flows").unwrap_or_default();
    }
    if dir.join("assembly_sequence.json").exists() {
        let v = read_json(&dir.join("assembly_sequence.json"))?;
        doc.assembly_sequence = take_array(&v, "sequence")?;
    }
    if dir.join("parameters.json").exists() {
        let v = read_json(&dir.join("parameters.json"))?;
        if let Some(map) = v.get("parameters") {
            doc.parameters =
                serde_json::from_value(map.clone()).map_err(|source| LoadError::Json {
                    path: "parameters.json".into(),
                    source,
                })?;
        }
    }
    if dir.join("provenance.json").exists() {
        let v = read_json(&dir.join("provenance.json"))?;
        doc.revisions = take_array(&v, "revisions").unwrap_or_default();
        doc.decisions = take_array(&v, "decisions").unwrap_or_default();
        doc.evidence = take_array(&v, "evidence").unwrap_or_default();
        doc.analyses = take_array(&v, "analyses").unwrap_or_default();
    }

    Ok(doc)
}

fn take_array<T: serde::de::DeserializeOwned>(v: &Value, key: &str) -> Result<Vec<T>, LoadError> {
    match v.get(key) {
        None => Ok(vec![]),
        Some(Value::Array(_)) => {
            serde_json::from_value(v.get(key).cloned().unwrap()).map_err(|source| LoadError::Json {
                path: key.into(),
                source,
            })
        }
        Some(_) => Err(LoadError::Other(format!("{key} must be an array"))),
    }
}
