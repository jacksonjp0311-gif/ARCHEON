//! Provenance is evidence about an engineering object, not authority to change it.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProvenanceClass {
    Source,
    Derived,
    Generated,
    Simulated,
    Validated,
    Measured,
    Assumed,
    Unverified,
    UserLocked,
}

impl ProvenanceClass {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Source => "SOURCE",
            Self::Derived => "DERIVED",
            Self::Generated => "GENERATED",
            Self::Simulated => "SIMULATED",
            Self::Validated => "VALIDATED",
            Self::Measured => "MEASURED",
            Self::Assumed => "ASSUMED",
            Self::Unverified => "UNVERIFIED",
            Self::UserLocked => "USER_LOCKED",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Provenance {
    pub class: ProvenanceClass,
    pub created_by: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub requirement_ids: Vec<String>,
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub evidence_ids: Vec<String>,
    #[serde(default)]
    pub revision_id: String,
    #[serde(default)]
    pub user_approved: bool,
}

impl Provenance {
    pub fn assumed(created_by: &str, reason: &str) -> Self {
        Self {
            class: ProvenanceClass::Assumed,
            created_by: created_by.into(),
            reason: reason.into(),
            requirement_ids: vec![],
            agent_id: None,
            tools: vec![],
            evidence_ids: vec![],
            revision_id: "rev.0001".into(),
            user_approved: false,
        }
    }

    pub fn generated(created_by: &str, reason: &str) -> Self {
        let mut p = Self::assumed(created_by, reason);
        p.class = ProvenanceClass::Generated;
        p
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_screaming_snake() {
        let p = Provenance::assumed("human", "prototype envelope");
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("ASSUMED"));
        let back: Provenance = serde_json::from_str(&json).unwrap();
        assert_eq!(back.class, ProvenanceClass::Assumed);
    }
}
