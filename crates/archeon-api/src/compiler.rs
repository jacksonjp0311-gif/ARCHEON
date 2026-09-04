//! Icon compiler glue: version stamps, UI discovery, HARD RESET queue.
use serde_json::{json, Value};
use std::{
    env,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

pub fn release() -> String {
    option_env!("ARCHEON_VERSION")
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| archeon_design_ir::VERSION.to_string())
}

pub fn product_version() -> String {
    let release = release();
    match read_dev_build() {
        Some(n) if n > 0 => format!("{release}+dev.{n}"),
        _ => release,
    }
}

pub fn read_dev_build() -> Option<u64> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(ui) = env::var("ARCHEON_UI_DIR") {
        if let Some(parent) = Path::new(&ui).parent() {
            dirs.push(parent.to_path_buf());
        }
    }
    if let Ok(local) = env::var("LOCALAPPDATA") {
        dirs.push(PathBuf::from(local).join("ARCHEON"));
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
        }
    }
    if let Ok(cwd) = env::current_dir() {
        dirs.push(cwd.clone());
        dirs.push(cwd.join(".."));
    }
    for dir in dirs {
        let path = dir.join("DEV_BUILD");
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(n) = raw.trim().parse::<u64>() {
                return Some(n);
            }
        }
    }
    None
}

pub fn find_ui_dir(root: &Path) -> Option<PathBuf> {
    if let Ok(raw) = env::var("ARCHEON_UI_DIR") {
        let path = PathBuf::from(raw);
        if path.join("index.html").is_file() {
            return Some(path);
        }
    }
    let mut candidates = Vec::new();
    if let Ok(local) = env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local).join("ARCHEON").join("ui"));
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("ui"));
        }
    }
    candidates.push(root.join("apps").join("workstation").join("dist"));
    candidates
        .into_iter()
        .find(|p| p.join("index.html").is_file())
}

pub fn write_compiler_status(
    root: &Path,
    phase: &str,
    version: &str,
    ok: Option<bool>,
    error: &str,
) -> Result<(), String> {
    let ui = env::var("ARCHEON_UI_DIR")
        .map(PathBuf::from)
        .ok()
        .or_else(|| find_ui_dir(root))
        .unwrap_or_else(|| root.join("apps").join("workstation").join("dist"));
    std::fs::create_dir_all(&ui).map_err(|e| e.to_string())?;
    let body = json!({
        "phase": phase,
        "version": version,
        "ok": ok,
        "error": error,
        "at": chrono::Utc::now().to_rfc3339()
    });
    std::fs::write(
        ui.join("compiler-status.json"),
        serde_json::to_string(&body).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

pub fn queue_update_compiler(root: &Path) -> Result<Value, String> {
    let script = root.join("scripts").join("Ensure-Archeon-Backend.ps1");
    if !script.is_file() {
        return Err(format!("update compiler missing at {}", script.display()));
    }
    let version = product_version();
    write_compiler_status(root, "queued-hard-reset", &version, None, "")?;

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut command = Command::new("powershell.exe");
        command
            .arg("-NoLogo")
            .arg("-NoProfile")
            .arg("-WindowStyle")
            .arg("Hidden")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(&script)
            .arg("-WaitSeconds")
            .arg("120")
            .arg("-Force")
            .arg("-CompileUi")
            .current_dir(root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x0800_0000);
        command
            .spawn()
            .map_err(|err| format!("start update compiler: {err}"))?;
        Ok(json!({
            "queued": true,
            "phase": "queued-hard-reset",
            "version": version,
            "script": script.display().to_string()
        }))
    }

    #[cfg(not(windows))]
    {
        let _ = script;
        Err("hard-reset compiler is only implemented for Windows desktop launches".into())
    }
}
