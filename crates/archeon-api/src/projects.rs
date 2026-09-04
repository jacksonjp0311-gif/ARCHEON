//! Project discovery, load, and CAD import. Geometry files are attachments to DesignIR.
use archeon_design_ir::{
    load_project_dir, save_project_dir, Assembly, CadRef, DesignDocument, EntityId, FidelityLevel,
    GeometryClass, Part, Primitive, Project, Revision, Spatial, System,
};
use archeon_provenance::{Provenance, ProvenanceClass};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub revision: String,
    pub folder: String,
    pub parts: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectIn {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub template: String,
}

pub fn project_slug(name: &str) -> Option<String> {
    let mut slug = String::new();
    let mut dash = false;
    for ch in name.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !dash && !slug.is_empty() {
            slug.push('-');
            dash = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    (!slug.is_empty()).then_some(slug)
}

/// Creates the minimum valid DesignIR workspace. Shared parametric components,
/// materials, and detail budgets are inherited as engineering context, while no
/// geometry or conclusions are copied into the new design.
pub fn create_project(
    repo: &Path,
    input: &CreateProjectIn,
    context: &DesignDocument,
) -> io::Result<(PathBuf, DesignDocument)> {
    let slug = project_slug(&input.name).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "project name must contain letters or numbers",
        )
    })?;
    let dir = projects_root(repo).join(&slug);
    if dir.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            format!("project folder {slug} already exists"),
        ));
    }
    let mut provenance = Provenance::generated("operator", "New DesignIR engineering workspace");
    provenance.user_approved = true;
    let system_id = EntityId::new(format!("sys.{slug}"));
    let assembly_id = EntityId::new(format!("asm.{slug}"));
    let project_id = EntityId::new(format!("project.{slug}"));
    let template = if input.template.trim().is_empty() {
        "blank"
    } else {
        input.template.trim()
    };
    let doc = DesignDocument {
        schema_version: archeon_design_ir::SCHEMA_VERSION.into(),
        project: Project {
            id: project_id,
            name: input.name.trim().into(),
            description: if input.description.trim().is_empty() {
                format!("Adaptive {template} engineering project")
            } else {
                input.description.trim().into()
            },
            revision_id: "rev.0001".into(),
            branch: "main".into(),
            kernel: "primitive".into(),
            domain: "spatial_engineering".into(),
            fidelity: FidelityLevel::Engineering,
            provenance: provenance.clone(),
        },
        systems: vec![System {
            id: system_id.clone(),
            name: input.name.trim().into(),
            parent: None,
            provenance: provenance.clone(),
        }],
        assemblies: vec![Assembly {
            id: assembly_id,
            name: format!("{} Root Assembly", input.name.trim()),
            parent: None,
            system: Some(system_id),
            children: vec![],
            semantic_role: "root_machine".into(),
            provenance: provenance.clone(),
        }],
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
        materials: context.materials.clone(),
        requirements: vec![],
        analyses: vec![],
        evidence: vec![],
        decisions: vec![],
        revisions: vec![Revision {
            id: "rev.0001".into(),
            parent_revision: None,
            transaction_id: None,
            timestamp: Utc::now().to_rfc3339(),
            author: "operator".into(),
            agent: None,
            message: format!("Create {template} engineering workspace"),
            geometry_hash: None,
            design_hash: None,
        }],
        parameters: Default::default(),
        assembly_sequence: vec![],
        fastener_groups: vec![],
        assembly_plans: vec![],
        fit_relations: vec![],
        component_library: context.component_library.clone(),
        detail_budget: context.detail_budget.clone(),
    };
    std::fs::create_dir_all(&dir)?;
    save_project_dir(&doc, &dir)?;
    Ok((dir, doc))
}

pub fn save_refined_part_context(
    repo: &Path,
    project_dir: &Path,
    doc: &DesignDocument,
    part_id: &str,
) -> io::Result<PathBuf> {
    let part = doc.part(part_id).ok_or_else(|| {
        io::Error::new(io::ErrorKind::NotFound, format!("unknown part {part_id}"))
    })?;
    let ports = doc
        .ports
        .iter()
        .filter(|item| item.host == part.id)
        .cloned()
        .collect::<Vec<_>>();
    let port_ids = ports
        .iter()
        .map(|item| item.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let interfaces = doc
        .interfaces
        .iter()
        .filter(|item| port_ids.contains(item.a.as_str()) || port_ids.contains(item.b.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    let features = doc
        .features
        .iter()
        .filter(|item| item.part == part.id)
        .cloned()
        .collect::<Vec<_>>();
    let material = part
        .material
        .as_ref()
        .and_then(|id| doc.materials.iter().find(|item| &item.id == id))
        .cloned();
    let hash = doc.design_hash();
    let safe = safe_filename(part.id.as_str()).replace('.', "_");
    let dir = repo.join("library").join("refined-parts").join(&safe);
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!(
        "{}-{}.json",
        safe_filename(&doc.project.revision_id),
        &hash[..12]
    ));
    let payload = json!({
        "schema": "archeon.refined-part-context.v1",
        "saved_at": Utc::now().to_rfc3339(),
        "source": {
            "project_id": doc.project.id,
            "project_name": doc.project.name,
            "project_folder": project_dir.file_name().and_then(|v| v.to_str()),
            "revision_id": doc.project.revision_id,
            "design_hash": hash
        },
        "truth": "REVISION_LINKED_CONTEXT",
        "part": part,
        "features": features,
        "ports": ports,
        "interfaces": interfaces,
        "material": material,
        "validation": {
            "status": "UNVERIFIED",
            "note": "Snapshot preserves source evidence. Revalidate fits, loads, cost, chemistry, and CAD geometry before reuse."
        }
    });
    let mut bytes = serde_json::to_vec_pretty(&payload)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    bytes.push(b'\n');
    std::fs::write(&path, bytes)?;
    Ok(path)
}

pub fn projects_root(repo: &Path) -> PathBuf {
    repo.join("projects")
}

pub fn list_projects(repo: &Path) -> Vec<ProjectSummary> {
    let mut out = Vec::new();
    let root = projects_root(repo);
    let Ok(entries) = std::fs::read_dir(&root) else {
        return out;
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        if !dir.join("project.json").is_file() {
            continue;
        }
        match load_project_dir(&dir) {
            Ok(doc) => out.push(ProjectSummary {
                id: doc.project.id.0.clone(),
                name: doc.project.name.clone(),
                revision: doc.project.revision_id.clone(),
                folder: entry.file_name().to_string_lossy().into_owned(),
                parts: doc.parts.len(),
            }),
            Err(_) => {
                out.push(ProjectSummary {
                    id: format!("project.{}", entry.file_name().to_string_lossy()),
                    name: entry.file_name().to_string_lossy().into_owned(),
                    revision: String::new(),
                    folder: entry.file_name().to_string_lossy().into_owned(),
                    parts: 0,
                });
            }
        }
    }
    out.sort_by(|a, b| a.folder.cmp(&b.folder));
    out
}

pub fn resolve_project_dir(repo: &Path, folder_or_id: &str) -> Option<PathBuf> {
    let key = folder_or_id.trim();
    if key.is_empty() {
        return None;
    }
    let direct = projects_root(repo).join(key);
    if direct.join("project.json").is_file() {
        return Some(direct);
    }
    list_projects(repo)
        .into_iter()
        .find(|p| p.id == key || p.folder == key)
        .map(|p| projects_root(repo).join(p.folder))
}

/// Attach generated/imported CAD files onto parts without rewriting the JSON seed.
pub fn attach_cad_files(doc: &mut DesignDocument, dir: &Path) {
    let manifest = std::fs::read_to_string(dir.join("generated").join("manifest.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
    for part in &mut doc.parts {
        let stem = part.id.as_str().replace('.', "_");
        let gen_stl = dir.join("generated").join(format!("{stem}.stl"));
        let gen_step = dir.join("generated").join(format!("{stem}.step"));
        let cad_stl = dir.join("cad").join(format!("{stem}.stl"));
        let cad_step = dir.join("cad").join(format!("{stem}.step"));
        let cad_glb = dir.join("cad").join(format!("{stem}.glb"));

        if gen_step.is_file() {
            let mut cad = CadRef::attached(
                "step",
                format!("generated/{stem}.step"),
                gen_stl.is_file().then(|| format!("generated/{stem}.stl")),
                "GENERATED",
                "Kernel STEP. Spatial view uses STL tessellation if present. Frame CAD_LOCAL, world Z-UP, units m. Viewer does not rotate to Y-up.",
                "GENERATED",
            );
            if let Some(record) = manifest
                .as_ref()
                .and_then(|value| value["parts"].as_array())
                .and_then(|parts| parts.iter().find(|record| record["id"] == part.id.as_str()))
            {
                cad.geometry_class = match record["geometry_class"].as_str() {
                    Some("GENERATED_EXACT") => GeometryClass::GeneratedExact,
                    Some("GENERATED_PREVIEW") => GeometryClass::GeneratedPreview,
                    Some("SEMANTIC_ONLY") => GeometryClass::SemanticOnly,
                    Some("PRIMITIVE_FALLBACK") => GeometryClass::PrimitiveFallback,
                    _ => cad.geometry_class,
                };
                cad.geometry_revision = record["geometry_revision"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();
            }
            part.spatial.cad = Some(cad);
        } else if cad_step.is_file() {
            part.spatial.cad = Some(CadRef::attached(
                "step",
                format!("cad/{stem}.step"),
                cad_stl.is_file().then(|| format!("cad/{stem}.stl")),
                "SOURCE",
                "Imported STEP. Exact file is stored; preview may be tessellated. Declared CAD_LOCAL Z-UP; not silently rotated.",
                "SOURCE",
            ));
        } else if cad_glb.is_file() {
            part.spatial.cad = Some(CadRef::attached(
                "glb",
                format!("cad/{stem}.glb"),
                None,
                "SOURCE",
                "Imported glTF. Visualization only — not BREP.",
                "SOURCE",
            ));
        } else if cad_stl.is_file() {
            part.spatial.cad = Some(CadRef::attached(
                "stl",
                format!("cad/{stem}.stl"),
                Some(format!("cad/{stem}.stl")),
                "SOURCE",
                "Imported STL tessellation. Not exact CAD. Declared CAD_LOCAL Z-UP assumption; not silently rotated.",
                "SOURCE",
            ));
        } else if gen_stl.is_file() {
            part.spatial.cad = Some(CadRef::attached(
                "stl",
                format!("generated/{stem}.stl"),
                Some(format!("generated/{stem}.stl")),
                "GENERATED",
                "Kernel STL tessellation. Frame CAD_LOCAL, world Z-UP, units m. Viewer must not recenter or Y-up rotate.",
                "GENERATED",
            ));
        }
    }
}

pub fn safe_filename(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("import.bin");
    base.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

pub fn ext_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

pub fn media_is_allowed(rel: &str) -> bool {
    let n = rel.replace('\\', "/");
    (n.starts_with("cad/") || n.starts_with("generated/")) && !n.contains("..")
}

pub fn create_imported_part(
    doc: &mut DesignDocument,
    filename: &str,
    rel_path: &str,
    format: &str,
    bbox: Option<[f64; 3]>,
    preview: Option<String>,
) -> String {
    let slug = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("import")
        .chars()
        .map(|c| {
            if c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' {
                c
            } else if c.is_ascii_uppercase() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>();
    let mut id = format!("part.import.{slug}");
    if doc.part(&id).is_some() {
        id = format!("part.import.{slug}_{}", doc.parts.len());
    }
    let [sx, sy, sz] = bbox.unwrap_or([0.08, 0.08, 0.08]);
    let parent = doc.assemblies.first().map(|a| a.id.clone());
    let stage = doc
        .parts
        .iter()
        .map(|p| p.spatial.assembly_stage)
        .max()
        .unwrap_or(0)
        + 1;
    doc.parts.push(Part {
        id: EntityId::new(id.clone()),
        name: filename.to_string(),
        parent,
        system: doc.systems.first().map(|s| s.id.clone()),
        material: None,
        semantic_role: "imported_cad".into(),
        qty: 1,
        catalog_ref: None,
        component_class: None,
        detail_tier: "primary".into(),
        spatial: Spatial {
            origin_m: [0.0, 0.0, sz / 2.0],
            rpy_rad: [0.0, 0.0, 0.0],
            primitive: Primitive::Box { sx, sy, sz },
            assembly_stage: stage,
            explosion_vector: [0.0, 0.0, 1.0],
            explosion_distance_m: sz.max(0.12),
            radial_group: Some("import".into()),
            parent_axis: None,
            service_path: vec![],
            cad: Some(CadRef::attached(
                format,
                rel_path,
                preview,
                "SOURCE",
                if format == "step" || format == "stp" {
                    "Imported STEP stored as exact CAD. Declared CAD_LOCAL Z-UP. Spatial mesh is tessellation if present."
                } else {
                    "Imported mesh. Visualization only — not a BREP kernel solid. Declared CAD_LOCAL Z-UP assumption; not silently rotated."
                },
                "SOURCE",
            )),
        },
        provenance: {
            let mut p = Provenance::generated("operator", "CAD import");
            p.class = ProvenanceClass::Source;
            p
        },
    });
    id
}

/// Binary or ASCII STL bounding-box extents (sx, sy, sz).
pub fn stl_bbox(bytes: &[u8]) -> Option<[f64; 3]> {
    if bytes.len() >= 84 && !starts_ascii_solid(bytes) {
        let n = u32::from_le_bytes(bytes[80..84].try_into().ok()?) as usize;
        let need = 84 + n.saturating_mul(50);
        if bytes.len() < need {
            return None;
        }
        let mut min = [f32::MAX; 3];
        let mut max = [f32::MIN; 3];
        for i in 0..n {
            let off = 84 + i * 50 + 12;
            for v in 0..3 {
                let b = off + v * 12;
                for k in 0..3 {
                    let x = f32::from_le_bytes(bytes[b + k * 4..b + k * 4 + 4].try_into().ok()?);
                    min[k] = min[k].min(x);
                    max[k] = max[k].max(x);
                }
            }
        }
        return Some([
            (max[0] - min[0]) as f64,
            (max[1] - min[1]) as f64,
            (max[2] - min[2]) as f64,
        ]);
    }
    ascii_stl_bbox(bytes)
}

fn starts_ascii_solid(bytes: &[u8]) -> bool {
    let head = std::str::from_utf8(bytes.get(..5).unwrap_or(&[])).unwrap_or("");
    head.eq_ignore_ascii_case("solid") && bytes.get(84).map(|b| *b < 128).unwrap_or(true)
}

fn ascii_stl_bbox(bytes: &[u8]) -> Option<[f64; 3]> {
    let text = std::str::from_utf8(bytes).ok()?;
    let mut min = [f64::MAX; 3];
    let mut max = [f64::MIN; 3];
    let mut any = false;
    for line in text.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("vertex ") {
            let mut nums = rest
                .split_whitespace()
                .filter_map(|s| s.parse::<f64>().ok());
            let x = nums.next()?;
            let y = nums.next()?;
            let z = nums.next()?;
            any = true;
            min[0] = min[0].min(x);
            min[1] = min[1].min(y);
            min[2] = min[2].min(z);
            max[0] = max[0].max(x);
            max[1] = max[1].max(y);
            max[2] = max[2].max(z);
        }
    }
    if !any {
        return None;
    }
    Some([max[0] - min[0], max[1] - min[1], max[2] - min[2]])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_paths_are_jailed() {
        assert!(media_is_allowed("cad/part.stl"));
        assert!(media_is_allowed("generated/part_base_plate.stl"));
        assert!(!media_is_allowed("../Cargo.toml"));
        assert!(!media_is_allowed("cad/../../secrets.json"));
    }

    #[test]
    fn ascii_stl_bbox_reads_cube() {
        let stl = b"solid cube\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid cube\n";
        let bb = stl_bbox(stl).unwrap();
        assert!((bb[0] - 1.0).abs() < 1e-9);
        assert!((bb[1] - 1.0).abs() < 1e-9);
    }

    #[test]
    fn project_slug_is_path_safe_and_deterministic() {
        assert_eq!(
            project_slug("  Lunar Elbow / Mk II  ").as_deref(),
            Some("lunar-elbow-mk-ii")
        );
        assert_eq!(project_slug("../../"), None);
        assert_eq!(project_slug("A__B").as_deref(), Some("a-b"));
    }
}
