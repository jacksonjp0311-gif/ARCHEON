use crate::entities::*;
use crate::ids::EntityId;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignDocument {
    #[serde(default = "schema")]
    pub schema_version: String,
    pub project: Project,
    #[serde(default)]
    pub systems: Vec<System>,
    #[serde(default)]
    pub assemblies: Vec<Assembly>,
    #[serde(default)]
    pub parts: Vec<Part>,
    #[serde(default)]
    pub features: Vec<Feature>,
    #[serde(default)]
    pub datums: Vec<Datum>,
    #[serde(default)]
    pub ports: Vec<Port>,
    #[serde(default)]
    pub interfaces: Vec<Interface>,
    #[serde(default)]
    pub mates: Vec<Mate>,
    #[serde(default)]
    pub joints: Vec<Joint>,
    #[serde(default)]
    pub constraints: Vec<ConstraintEntity>,
    #[serde(default)]
    pub functions: Vec<FunctionEntity>,
    #[serde(default)]
    pub flows: Vec<Flow>,
    #[serde(default)]
    pub loads: Vec<Load>,
    #[serde(default)]
    pub materials: Vec<Material>,
    #[serde(default)]
    pub requirements: Vec<Requirement>,
    #[serde(default)]
    pub analyses: Vec<Analysis>,
    #[serde(default)]
    pub evidence: Vec<Evidence>,
    #[serde(default)]
    pub decisions: Vec<Decision>,
    #[serde(default)]
    pub revisions: Vec<Revision>,
    #[serde(default)]
    pub parameters: BTreeMap<String, Parameter>,
    #[serde(default)]
    pub assembly_sequence: Vec<EntityId>,
    #[serde(default)]
    pub fastener_groups: Vec<FastenerGroup>,
    #[serde(default)]
    pub assembly_plans: Vec<AssemblyPlan>,
    #[serde(default)]
    pub fit_relations: Vec<FitRelation>,
    #[serde(default)]
    pub component_library: Vec<LibraryComponent>,
    #[serde(default)]
    pub detail_budget: Vec<DetailBudgetEntry>,
}

fn schema() -> String {
    "0.6.0".into()
}

impl DesignDocument {
    pub fn all_ids(&self) -> Vec<EntityId> {
        let mut ids = Vec::new();
        ids.push(self.project.id.clone());
        ids.extend(self.systems.iter().map(|e| e.id.clone()));
        ids.extend(self.assemblies.iter().map(|e| e.id.clone()));
        ids.extend(self.parts.iter().map(|e| e.id.clone()));
        ids.extend(self.features.iter().map(|e| e.id.clone()));
        ids.extend(self.datums.iter().map(|e| e.id.clone()));
        ids.extend(self.ports.iter().map(|e| e.id.clone()));
        ids.extend(self.interfaces.iter().map(|e| e.id.clone()));
        ids.extend(self.mates.iter().map(|e| e.id.clone()));
        ids.extend(self.joints.iter().map(|e| e.id.clone()));
        ids.extend(self.constraints.iter().map(|e| e.id.clone()));
        ids.extend(self.functions.iter().map(|e| e.id.clone()));
        ids.extend(self.flows.iter().map(|e| e.id.clone()));
        ids.extend(self.loads.iter().map(|e| e.id.clone()));
        ids.extend(self.materials.iter().map(|e| e.id.clone()));
        ids.extend(self.requirements.iter().map(|e| e.id.clone()));
        ids.extend(self.analyses.iter().map(|e| e.id.clone()));
        ids.extend(self.evidence.iter().map(|e| e.id.clone()));
        ids.extend(self.decisions.iter().map(|e| e.id.clone()));
        ids.extend(self.fastener_groups.iter().map(|e| e.id.clone()));
        ids.extend(self.assembly_plans.iter().map(|e| e.id.clone()));
        ids.extend(self.fit_relations.iter().map(|e| e.id.clone()));
        ids.extend(self.component_library.iter().map(|e| e.id.clone()));
        ids
    }

    pub fn id_set(&self) -> BTreeSet<String> {
        self.all_ids().into_iter().map(|i| i.0).collect()
    }

    pub fn part(&self, id: &str) -> Option<&Part> {
        self.parts.iter().find(|p| p.id.as_str() == id)
    }

    pub fn part_mut(&mut self, id: &str) -> Option<&mut Part> {
        self.parts.iter_mut().find(|p| p.id.as_str() == id)
    }

    pub fn joint(&self, id: &str) -> Option<&Joint> {
        self.joints.iter().find(|joint| joint.id.as_str() == id)
    }

    pub fn design_hash(&self) -> String {
        let payload = serde_json::to_vec(self).unwrap_or_default();
        let mut h = Sha256::new();
        h.update(&payload);
        hex::encode(h.finalize())
    }

    /// Derived reach along the serial chain. ASSUMED kinematic model: sum of named lengths.
    pub fn derived_reach_m(&self) -> Option<f64> {
        let keys = ["upper_arm.length", "forearm.length", "wrist.length"];
        let mut sum = 0.0;
        for k in keys {
            sum += self.parameters.get(k)?.si_value();
        }
        Some(sum)
    }
}
