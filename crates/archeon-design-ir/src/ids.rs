use serde::{Deserialize, Serialize};
use std::fmt;

/// Stable semantic identity. Prefer `part.shoulder.housing` over kernel `face_317`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct EntityId(pub String);

impl EntityId {
    pub fn new(s: impl Into<String>) -> Self {
        Self(s.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// `kind.rest` — kind is the first dotted segment.
    pub fn kind(&self) -> &str {
        self.0.split('.').next().unwrap_or(self.0.as_str())
    }
}

impl fmt::Display for EntityId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<&str> for EntityId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl From<String> for EntityId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

pub fn is_semantic_id(s: &str) -> bool {
    let mut parts = s.split('.');
    let Some(first) = parts.next() else {
        return false;
    };
    valid_kind(first) && parts.all(valid_seg)
}

fn rest_ok(mut chars: std::str::Chars<'_>) -> bool {
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

fn valid_kind(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() => rest_ok(chars),
        _ => false,
    }
}

fn valid_seg(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit() => rest_ok(chars),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_semantic_ids() {
        assert!(is_semantic_id("part.shoulder.housing"));
        assert!(is_semantic_id("req.002"));
        assert!(!is_semantic_id("Face_317"));
        assert!(!is_semantic_id(""));
    }
}
