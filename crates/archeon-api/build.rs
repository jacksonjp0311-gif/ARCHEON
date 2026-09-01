use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn repo_root(manifest_dir: &Path) -> PathBuf {
    manifest_dir.join("../../..")
}

fn tracked_version(manifest_dir: &Path) -> String {
    let version_file = repo_root(manifest_dir).join("VERSION");
    println!("cargo:rerun-if-changed={}", version_file.display());
    fs::read_to_string(&version_file)
        .unwrap_or_else(|_| env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "0.0.0".into()))
        .trim()
        .to_string()
}

fn pack_file_version(version: &str) -> u64 {
    let mut parts = version.split('.').filter_map(|p| p.parse::<u64>().ok());
    let major = parts.next().unwrap_or(0);
    let minor = parts.next().unwrap_or(0);
    let patch = parts.next().unwrap_or(0);
    let build = parts.next().unwrap_or(0);
    (major << 48) | (minor << 32) | (patch << 16) | build
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let version = tracked_version(&manifest_dir);
    println!("cargo:rustc-env=ARCHEON_VERSION={version}");
    println!("cargo:rerun-if-changed=assets/archeon.ico");

    if env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() != "windows" {
        return;
    }

    let ico = manifest_dir.join("assets/archeon.ico");
    if !ico.is_file() {
        println!(
            "cargo:warning=ARCHEON icon missing at {}; Windows exe will not carry a product icon",
            ico.display()
        );
        return;
    }

    let mut res = winresource::WindowsResource::new();
    res.set_icon(ico.to_str().expect("utf-8 icon path"));
    res.set("ProductName", "ARCHEON");
    res.set("FileDescription", "ARCHEON Spatial Engineering OS");
    res.set("LegalCopyright", "MIT");
    res.set("ProductVersion", &version);
    res.set("FileVersion", &version);
    res.set("OriginalFilename", "archeon.exe");
    res.set("InternalName", "archeon");
    res.set_version_info(winresource::VersionInfo::PRODUCTVERSION, pack_file_version(&version));
    res.set_version_info(winresource::VersionInfo::FILEVERSION, pack_file_version(&version));
    if let Err(err) = res.compile() {
        println!("cargo:warning=failed to embed ARCHEON Windows icon: {err}");
    }
}
