use std::env;
use std::path::Path;

fn main() {
    // tauri-build embeds the Windows application manifest only into the app binary. The
    // manifest is what loads Common Controls v6, so test executables built without it crash
    // with STATUS_ENTRYPOINT_NOT_FOUND. Embed it ourselves for every binary instead.
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    if let Err(error) = tauri_build::try_build(attributes) {
        panic!("tauri-build failed: {error:#}");
    }
    embed_windows_manifest();
}

fn embed_windows_manifest() {
    let is_windows_msvc = env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if !is_windows_msvc {
        return;
    }
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    // `rustc-link-arg` (unlike tauri-build's bins-only resource) also applies to tests.
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}
