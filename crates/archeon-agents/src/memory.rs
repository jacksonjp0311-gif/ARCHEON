//! Memory is evidence. It cannot mutate DesignIR.
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryHit {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub path: String,
}

pub trait MemoryProvider {
    fn status(&self) -> serde_json::Value;
    fn remember(&self, kind: &str, text: &str) -> Result<MemoryHit, String>;
    fn query(&self, q: &str, limit: usize) -> Result<Vec<MemoryHit>, String>;
}

pub struct LocalMemoryProvider {
    pub dir: PathBuf,
}

impl LocalMemoryProvider {
    pub fn new(dir: impl AsRef<Path>) -> Self {
        let dir = dir.as_ref().to_path_buf();
        let _ = fs::create_dir_all(&dir);
        Self { dir }
    }

    fn file(&self) -> PathBuf {
        self.dir.join("local-memory.jsonl")
    }
}

impl MemoryProvider for LocalMemoryProvider {
    fn status(&self) -> serde_json::Value {
        serde_json::json!({
            "provider": "local",
            "dir": self.dir.display().to_string(),
            "authority": "evidence_only",
            "note": "Local JSONL mock. Does not mutate DesignIR."
        })
    }

    fn remember(&self, kind: &str, text: &str) -> Result<MemoryHit, String> {
        let hit = MemoryHit {
            id: format!("mem.{}", chrono_lite()),
            kind: kind.into(),
            text: text.into(),
            path: self.file().display().to_string(),
        };
        let line = serde_json::to_string(&hit).map_err(|e| e.to_string())?;
        use std::io::Write;
        let mut f = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.file())
            .map_err(|e| e.to_string())?;
        writeln!(f, "{line}").map_err(|e| e.to_string())?;
        Ok(hit)
    }

    fn query(&self, q: &str, limit: usize) -> Result<Vec<MemoryHit>, String> {
        let raw = fs::read_to_string(self.file()).unwrap_or_default();
        let q = q.to_lowercase();
        let mut hits = Vec::new();
        for line in raw.lines() {
            if let Ok(hit) = serde_json::from_str::<MemoryHit>(line) {
                if hit.text.to_lowercase().contains(&q) || hit.kind.to_lowercase().contains(&q) {
                    hits.push(hit);
                }
            }
            if hits.len() >= limit {
                break;
            }
        }
        Ok(hits)
    }
}

/// Documented stub. Cortex is not embedded and is not called.
pub struct CortexMemoryProvider;

impl MemoryProvider for CortexMemoryProvider {
    fn status(&self) -> serde_json::Value {
        serde_json::json!({
            "provider": "cortex",
            "implemented": false,
            "authority": "evidence_only",
            "note": "Stub. Phase 1 does not embed or modify Cortex."
        })
    }

    fn remember(&self, _kind: &str, _text: &str) -> Result<MemoryHit, String> {
        Err("CortexMemoryProvider is a stub — not implemented in Phase 1".into())
    }

    fn query(&self, _q: &str, _limit: usize) -> Result<Vec<MemoryHit>, String> {
        Ok(vec![])
    }
}

fn chrono_lite() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
