//! CAD worker boundary. The API never pretends Three.js is BREP.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CadStatus {
    pub kernel: String,
    pub build123d: bool,
    pub worker: String,
    pub last_error: Option<String>,
    pub note: String,
}

pub fn python() -> String {
    std::env::var("ARCHEON_CAD_PYTHON").unwrap_or_else(|_| "python".into())
}

pub fn worker_dir(root: &Path) -> PathBuf {
    if let Ok(p) = std::env::var("ARCHEON_CAD_WORKER") {
        let pb = PathBuf::from(p);
        if pb.is_absolute() {
            return pb;
        }
        return root.join(pb);
    }
    root.join("workers").join("cad-occt")
}

pub async fn ping(root: &Path) -> CadStatus {
    let dir = worker_dir(root);
    let mut cmd = Command::new(python());
    cmd.current_dir(&dir)
        .env("PYTHONPATH", &dir)
        .args(["-m", "archeon_cad", "ping", "--json"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    match cmd.output().await {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                return CadStatus {
                    kernel: v["kernel"].as_str().unwrap_or("unknown").into(),
                    build123d: v["build123d"].as_bool().unwrap_or(false),
                    worker: dir.display().to_string(),
                    last_error: None,
                    note: v["note"].as_str().unwrap_or("").into(),
                };
            }
            CadStatus {
                kernel: "unknown".into(),
                build123d: false,
                worker: dir.display().to_string(),
                last_error: Some(text.chars().take(400).collect()),
                note: "worker returned non-JSON".into(),
            }
        }
        Ok(out) => CadStatus {
            kernel: "offline".into(),
            build123d: false,
            worker: dir.display().to_string(),
            last_error: Some(
                String::from_utf8_lossy(&out.stderr)
                    .chars()
                    .take(400)
                    .collect(),
            ),
            note:
                "CAD worker failed. Geometry in the UI is a DesignIR spatial projection, not BREP."
                    .into(),
        },
        Err(e) => CadStatus {
            kernel: "offline".into(),
            build123d: false,
            worker: dir.display().to_string(),
            last_error: Some(e.to_string()),
            note: "Python CAD worker not started.".into(),
        },
    }
}

pub async fn regenerate(root: &Path, project: &Path) -> Result<serde_json::Value, String> {
    let dir = worker_dir(root);
    let out = Command::new(python())
        .current_dir(&dir)
        .env("PYTHONPATH", &dir)
        .args([
            "-m",
            "archeon_cad",
            "regenerate",
            "--project",
            &project.display().to_string(),
            "--json",
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        return Err(format!("cad regen failed: {stderr} {stdout}"));
    }
    serde_json::from_str(&stdout).map_err(|e| format!("cad json: {e}; raw={stdout}"))
}
