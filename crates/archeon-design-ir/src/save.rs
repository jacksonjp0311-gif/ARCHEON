use crate::DesignDocument;
use serde::Serialize;
use serde_json::json;
use std::fs;
use std::io;
use std::path::Path;

fn write_json(path: &Path, value: &impl Serialize) -> io::Result<()> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    let mut with_newline = bytes;
    with_newline.push(b'\n');
    fs::write(path, with_newline)
}

/// Persist the canonical split-file project representation. Generated CAD and
/// runtime memory are intentionally excluded.
pub fn save_project_dir(doc: &DesignDocument, dir: &Path) -> io::Result<()> {
    write_json(&dir.join("project.json"), &doc.project)?;
    write_json(
        &dir.join("requirements.json"),
        &json!({ "requirements": doc.requirements }),
    )?;
    write_json(
        &dir.join("assemblies.json"),
        &json!({ "systems": doc.systems, "assemblies": doc.assemblies }),
    )?;
    write_json(&dir.join("parts.json"), &json!({ "parts": doc.parts }))?;
    write_json(
        &dir.join("interfaces.json"),
        &json!({ "ports": doc.ports, "interfaces": doc.interfaces, "mates": doc.mates }),
    )?;
    write_json(&dir.join("joints.json"), &json!({ "joints": doc.joints }))?;
    write_json(
        &dir.join("features.json"),
        &json!({ "datums": doc.datums, "features": doc.features, "constraints": doc.constraints }),
    )?;
    write_json(
        &dir.join("materials.json"),
        &json!({ "materials": doc.materials, "loads": doc.loads, "functions": doc.functions, "flows": doc.flows }),
    )?;
    write_json(
        &dir.join("parameters.json"),
        &json!({ "parameters": doc.parameters }),
    )?;
    write_json(
        &dir.join("provenance.json"),
        &json!({ "revisions": doc.revisions, "decisions": doc.decisions, "evidence": doc.evidence, "analyses": doc.analyses }),
    )?;
    write_json(
        &dir.join("assembly_sequence.json"),
        &json!({ "sequence": doc.assembly_sequence }),
    )?;
    write_json(
        &dir.join("fasteners.json"),
        &json!({ "fastener_groups": doc.fastener_groups }),
    )?;
    write_json(
        &dir.join("assembly_plan.json"),
        &json!({ "assembly_plans": doc.assembly_plans }),
    )?;
    write_json(
        &dir.join("fits.json"),
        &json!({ "fit_relations": doc.fit_relations }),
    )?;
    write_json(
        &dir.join("library.json"),
        &json!({ "component_library": doc.component_library, "detail_budget": doc.detail_budget }),
    )?;
    Ok(())
}
