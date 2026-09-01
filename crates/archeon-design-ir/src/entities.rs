use crate::ids::EntityId;
use archeon_provenance::Provenance;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: EntityId,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub revision_id: String,
    #[serde(default = "default_branch")]
    pub branch: String,
    #[serde(default = "default_kernel")]
    pub kernel: String,
    #[serde(default)]
    pub domain: String,
    pub provenance: Provenance,
}

fn default_branch() -> String {
    "main".into()
}
fn default_kernel() -> String {
    "primitive".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct System {
    pub id: EntityId,
    pub name: String,
    #[serde(default)]
    pub parent: Option<EntityId>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assembly {
    pub id: EntityId,
    pub name: String,
    #[serde(default)]
    pub parent: Option<EntityId>,
    #[serde(default)]
    pub system: Option<EntityId>,
    #[serde(default)]
    pub children: Vec<EntityId>,
    #[serde(default)]
    pub semantic_role: String,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Part {
    pub id: EntityId,
    pub name: String,
    #[serde(default)]
    pub parent: Option<EntityId>,
    #[serde(default)]
    pub system: Option<EntityId>,
    #[serde(default)]
    pub material: Option<EntityId>,
    #[serde(default)]
    pub semantic_role: String,
    #[serde(default = "one")]
    pub qty: u32,
    #[serde(default)]
    pub catalog_ref: Option<String>,
    #[serde(default)]
    pub spatial: Spatial,
    pub provenance: Provenance,
}

fn one() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Spatial {
    #[serde(default)]
    pub origin_m: [f64; 3],
    #[serde(default)]
    pub rpy_rad: [f64; 3],
    pub primitive: Primitive,
    #[serde(default)]
    pub assembly_stage: u32,
    #[serde(default = "unit_x")]
    pub explosion_vector: [f64; 3],
    #[serde(default)]
    pub explosion_distance_m: f64,
    #[serde(default)]
    pub radial_group: Option<String>,
    #[serde(default)]
    pub parent_axis: Option<EntityId>,
    #[serde(default)]
    pub service_path: Vec<[f64; 3]>,
}

fn unit_x() -> [f64; 3] {
    [0.0, 0.0, 1.0]
}

impl Default for Spatial {
    fn default() -> Self {
        Self {
            origin_m: [0.0, 0.0, 0.0],
            rpy_rad: [0.0, 0.0, 0.0],
            primitive: Primitive::Box {
                sx: 0.01,
                sy: 0.01,
                sz: 0.01,
            },
            assembly_stage: 0,
            explosion_vector: unit_x(),
            explosion_distance_m: 0.1,
            radial_group: None,
            parent_axis: None,
            service_path: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Primitive {
    Box { sx: f64, sy: f64, sz: f64 },
    Cylinder { radius: f64, height: f64 },
}

impl Primitive {
    pub fn bbox_m(&self) -> [f64; 3] {
        match *self {
            Primitive::Box { sx, sy, sz } => [sx, sy, sz],
            Primitive::Cylinder { radius, height } => [radius * 2.0, radius * 2.0, height],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub id: EntityId,
    pub part: EntityId,
    pub kind: FeatureKind,
    #[serde(default)]
    pub semantic_role: String,
    #[serde(default)]
    pub params: BTreeMap<String, serde_json::Value>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FeatureKind {
    Datum,
    SketchRectangle,
    SketchCircle,
    Extrude,
    Revolve,
    Cut,
    Hole,
    Fillet,
    Chamfer,
    Pattern,
    Pocket,
    Thread,
    Box,
    Cylinder,
    Transform,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Datum {
    pub id: EntityId,
    pub host: EntityId,
    pub kind: String,
    #[serde(default)]
    pub origin_m: [f64; 3],
    #[serde(default = "unit_z")]
    pub axis: [f64; 3],
    #[serde(default)]
    pub semantic_role: String,
    pub provenance: Provenance,
}

fn unit_z() -> [f64; 3] {
    [0.0, 0.0, 1.0]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Port {
    pub id: EntityId,
    pub host: EntityId,
    pub role: String,
    #[serde(default)]
    pub datum: Option<EntityId>,
    #[serde(default)]
    pub origin_m: [f64; 3],
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterfaceKind {
    Mechanical,
    Electrical,
    Thermal,
    Fluid,
    Structural,
    Logical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Interface {
    pub id: EntityId,
    pub name: String,
    pub kind: InterfaceKind,
    pub a: EntityId,
    pub b: EntityId,
    #[serde(default)]
    pub semantic_role: String,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mate {
    pub id: EntityId,
    pub interface: EntityId,
    pub kind: String,
    #[serde(default)]
    pub offset_m: f64,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintEntity {
    pub id: EntityId,
    pub kind: String,
    pub entities: Vec<EntityId>,
    #[serde(default)]
    pub value: Option<f64>,
    #[serde(default)]
    pub unit: Option<String>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionEntity {
    pub id: EntityId,
    pub name: String,
    #[serde(default)]
    pub parts: Vec<EntityId>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flow {
    pub id: EntityId,
    pub kind: String,
    pub from: EntityId,
    pub to: EntityId,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Load {
    pub id: EntityId,
    pub kind: String,
    pub target: EntityId,
    pub magnitude: f64,
    pub unit: String,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Material {
    pub id: EntityId,
    pub name: String,
    #[serde(default)]
    pub density_kg_m3: Option<f64>,
    #[serde(default)]
    pub notes: String,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Requirement {
    pub id: EntityId,
    pub text: String,
    #[serde(default)]
    pub quantity: Option<String>,
    #[serde(default)]
    pub operator: Option<String>,
    #[serde(default)]
    pub value: Option<f64>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub acceptance: String,
    /// None = not evaluated. Never invent satisfaction.
    #[serde(default)]
    pub satisfied: Option<bool>,
    #[serde(default)]
    pub evidence: Vec<EntityId>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Analysis {
    pub id: EntityId,
    pub kind: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub notes: String,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub id: EntityId,
    pub kind: String,
    pub text: String,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Decision {
    pub id: EntityId,
    pub text: String,
    #[serde(default)]
    pub requirement_ids: Vec<EntityId>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Revision {
    pub id: String,
    #[serde(default)]
    pub parent_revision: Option<String>,
    #[serde(default)]
    pub transaction_id: Option<String>,
    pub timestamp: String,
    pub author: String,
    #[serde(default)]
    pub agent: Option<String>,
    pub message: String,
    #[serde(default)]
    pub geometry_hash: Option<String>,
    #[serde(default)]
    pub design_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub name: String,
    pub value: f64,
    pub unit: String,
    #[serde(default)]
    pub si: Option<f64>,
    pub provenance: Provenance,
}

impl Parameter {
    pub fn si_value(&self) -> f64 {
        if let Some(si) = self.si {
            return si;
        }
        match self.unit.as_str() {
            "m" | "kg" | "s" | "rad" => self.value,
            "mm" => self.value / 1000.0,
            "g" => self.value / 1000.0,
            "deg" => self.value * std::f64::consts::PI / 180.0,
            _ => self.value,
        }
    }
}
