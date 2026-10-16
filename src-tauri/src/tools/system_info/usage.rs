//! Live CPU and memory load for the System Info page.

use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use specta::Type;
use sysinfo::System;
use tauri::State;

/// CPU usage is a difference between two readings, so one `System` lives for the whole
/// session and every poll compares against the previous one.
#[derive(Debug)]
pub struct UsageSampler(Mutex<System>);

impl Default for UsageSampler {
    fn default() -> Self {
        let mut system = System::new();
        // The first reading only sets the baseline; the next poll reports real numbers.
        system.refresh_cpu_usage();
        Self(Mutex::new(system))
    }
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemUsage {
    /// 0 to 100, across all cores.
    pub cpu_percent: f64,
    /// 0 to 100 for each logical core.
    pub core_percents: Vec<f64>,
    pub memory_used_bytes: f64,
    pub memory_total_bytes: f64,
    pub swap_used_bytes: f64,
    pub swap_total_bytes: f64,
}

impl UsageSampler {
    #[allow(clippy::cast_precision_loss)] // Byte counts above 2^53 are not a practical concern.
    pub fn sample(&self) -> SystemUsage {
        let mut system = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        system.refresh_cpu_usage();
        system.refresh_memory();
        SystemUsage {
            cpu_percent: f64::from(system.global_cpu_usage()).clamp(0.0, 100.0),
            core_percents: system
                .cpus()
                .iter()
                .map(|cpu| f64::from(cpu.cpu_usage()).clamp(0.0, 100.0))
                .collect(),
            memory_used_bytes: system.used_memory() as f64,
            memory_total_bytes: system.total_memory() as f64,
            swap_used_bytes: system.used_swap() as f64,
            swap_total_bytes: system.total_swap() as f64,
        }
    }
}

/// Current CPU and memory load. Poll it no faster than every second or so.
///
/// # Errors
/// Never fails; the `Result` lets the async command borrow managed state.
#[tauri::command]
#[specta::specta]
pub async fn system_usage(sampler: State<'_, UsageSampler>) -> Result<SystemUsage, String> {
    Ok(sampler.sample())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::Manager;
    use tauri::test::{mock_builder, mock_context, noop_assets};

    #[test]
    fn samples_plausible_values() {
        let sampler = UsageSampler::default();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        let usage = sampler.sample();
        assert!((0.0..=100.0).contains(&usage.cpu_percent));
        assert_ne!(usage.core_percents.len(), 0);
        assert!(usage.memory_total_bytes > 0.0);
        assert!(usage.memory_used_bytes <= usage.memory_total_bytes);
    }

    #[test]
    fn command_reads_managed_state() {
        let app = mock_builder()
            .build(mock_context(noop_assets()))
            .unwrap_or_else(|e| panic!("failed to build app: {e}"));
        app.manage(UsageSampler::default());
        let usage = tauri::async_runtime::block_on(system_usage(app.state()))
            .unwrap_or_else(|e| panic!("{e}"));
        assert!(usage.memory_total_bytes > 0.0);
    }
}
