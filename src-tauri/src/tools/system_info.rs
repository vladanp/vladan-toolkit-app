//! Backend for the "System Info" tool (`src/tools/system-info`).

use serde::Serialize;
use specta::Type;
use sysinfo::{CpuRefreshKind, System};

/// A snapshot of the host machine. Sizes are `f64` because TypeScript numbers are doubles.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub kernel_version: Option<String>,
    pub arch: String,
    pub cpu_brand: Option<String>,
    pub logical_cores: u32,
    pub physical_cores: Option<u32>,
    pub total_memory_bytes: f64,
    pub uptime_seconds: f64,
}

fn to_u32(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

/// Collects the snapshot. Blocking; call it off the main thread.
#[allow(clippy::cast_precision_loss)] // Byte counts above 2^53 are not a practical concern.
pub fn collect() -> SystemInfo {
    let mut system = System::new();
    system.refresh_memory();
    system.refresh_cpu_list(CpuRefreshKind::nothing());

    let cpu_brand = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().trim().to_owned())
        .filter(|brand| !brand.is_empty());

    SystemInfo {
        os_name: System::name(),
        os_version: System::long_os_version().or_else(System::os_version),
        kernel_version: System::kernel_version(),
        arch: System::cpu_arch(),
        cpu_brand,
        logical_cores: to_u32(system.cpus().len().max(1)),
        physical_cores: System::physical_core_count().map(to_u32),
        total_memory_bytes: system.total_memory() as f64,
        uptime_seconds: System::uptime() as f64,
    }
}

/// Collects the snapshot on a blocking worker thread.
///
/// # Errors
/// Returns an error if the worker thread panicked.
#[tauri::command]
#[specta::specta]
pub async fn system_info() -> Result<SystemInfo, String> {
    tauri::async_runtime::spawn_blocking(collect)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_plausible_values() {
        let info = collect();
        assert_ne!(info.arch, "");
        assert!(info.logical_cores >= 1);
        assert!(info.total_memory_bytes > 0.0);
        if let Some(physical) = info.physical_cores {
            assert!(physical >= 1 && physical <= info.logical_cores);
        }
    }

    #[test]
    fn to_u32_saturates() {
        assert_eq!(to_u32(7), 7);
        #[cfg(target_pointer_width = "64")]
        assert_eq!(to_u32(usize::MAX), u32::MAX);
    }

    #[test]
    fn command_returns_snapshot() {
        let info = tauri::async_runtime::block_on(system_info()).unwrap_or_else(|e| panic!("{e}"));
        assert!(info.logical_cores >= 1);
    }
}
