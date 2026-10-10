//! Backend for the "System Info" tool (`src/tools/system-info`).
//!
//! Three commands, so the page can show the quick parts right away:
//! [`system_info`] (a snapshot of the machine), [`graphics::system_graphics`] (graphics
//! cards and, on macOS, displays; this can take a moment) and [`usage::system_usage`]
//! (live CPU and memory load, polled while the page is open).

pub mod graphics;
pub mod usage;

use std::net::IpAddr;
use std::path::Path;

use serde::Serialize;
use specta::Type;
use starship_battery::units::{ratio::percent, time::second};
use sysinfo::{CpuRefreshKind, DiskKind, Disks, Motherboard, Networks, Product, System};

/// A snapshot of the host machine. Sizes are `f64` because TypeScript numbers are doubles.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub device: Device,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub kernel_version: Option<String>,
    pub host_name: Option<String>,
    pub arch: String,
    pub cpu_brand: Option<String>,
    pub cpu_frequency_mhz: Option<f64>,
    pub logical_cores: u32,
    pub physical_cores: Option<u32>,
    pub total_memory_bytes: f64,
    pub total_swap_bytes: f64,
    pub uptime_seconds: f64,
    pub disks: Vec<DiskInfo>,
    pub networks: Vec<NetworkInfo>,
    pub battery: Option<BatteryInfo>,
}

/// What the machine is, as far as its firmware says. Placeholder strings that vendors
/// leave in (`"To Be Filled By O.E.M."`, `"System Product Name"`) are dropped.
#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub motherboard: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum DiskType {
    Ssd,
    Hdd,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub kind: DiskType,
    pub total_bytes: f64,
    pub available_bytes: f64,
    pub removable: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub name: String,
    /// Local addresses, IPv4 first. Loopback and link-local addresses are left out.
    pub addresses: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum BatteryState {
    Charging,
    Discharging,
    Full,
    Empty,
    /// Plugged in but held below full by a charge limit.
    Paused,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    pub charge_percent: f64,
    pub state: BatteryState,
    /// Capacity left compared to when it was new. `None` when the battery reports nonsense.
    pub health_percent: Option<f64>,
    pub cycle_count: Option<u32>,
    pub seconds_to_full: Option<f64>,
    pub seconds_to_empty: Option<f64>,
}

fn to_u32(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

/// Firmware fields that mean "nobody filled this in".
const PLACEHOLDERS: &[&str] = &[
    "",
    "0",
    "all series",
    "base board manufacturer",
    "base board product name",
    "default string",
    "invalid",
    "none",
    "not applicable",
    "not available",
    "not specified",
    "o.e.m.",
    "oem",
    "system manufacturer",
    "system product name",
    "system version",
    "to be filled by o.e.m.",
    "type1productconfigid",
    "unknown",
    "x.x",
];

/// Trims a firmware string and drops it when it is a known placeholder.
fn clean(value: Option<String>) -> Option<String> {
    let value = value?.trim().to_owned();
    let lower = value.to_ascii_lowercase();
    (!PLACEHOLDERS.contains(&lower.as_str())).then_some(value)
}

/// `"ASUSTeK COMPUTER INC."` + `"ROG STRIX B550-F GAMING"`, without repeating the vendor
/// when the model already starts with it.
fn join_vendor(vendor: Option<String>, model: Option<String>) -> Option<String> {
    match (vendor, model) {
        (Some(vendor), Some(model))
            if model
                .to_ascii_lowercase()
                .starts_with(&vendor.to_ascii_lowercase()) =>
        {
            Some(model)
        }
        (Some(vendor), Some(model)) => Some(format!("{vendor} {model}")),
        (None, model) => model,
        (Some(_), None) => None,
    }
}

fn device() -> Device {
    let motherboard = Motherboard::new()
        .and_then(|board| join_vendor(clean(board.vendor_name()), clean(board.name())));
    Device {
        vendor: clean(Product::vendor_name()),
        model: clean(Product::name()),
        motherboard,
    }
}

/// Volumes worth showing: real drives, not the OS's internal or virtual mounts.
fn is_user_volume(mount_point: &Path, file_system: &str) -> bool {
    const HIDDEN_FILE_SYSTEMS: &[&str] = &["squashfs", "overlay", "tmpfs", "devtmpfs", "autofs"];
    const HIDDEN_PREFIXES: &[&str] = &["/System/Volumes/", "/private/var/vm", "/snap/", "/boot"];
    let mount = mount_point.to_string_lossy();
    !HIDDEN_FILE_SYSTEMS.contains(&file_system)
        && !HIDDEN_PREFIXES
            .iter()
            .any(|prefix| mount.starts_with(prefix))
}

#[allow(clippy::cast_precision_loss)] // Byte counts above 2^53 are not a practical concern.
fn disks() -> Vec<DiskInfo> {
    let mut disks: Vec<DiskInfo> = Disks::new_with_refreshed_list()
        .list()
        .iter()
        .filter(|disk| disk.total_space() > 0)
        .filter(|disk| is_user_volume(disk.mount_point(), &disk.file_system().to_string_lossy()))
        .map(|disk| DiskInfo {
            name: disk.name().to_string_lossy().trim().to_owned(),
            mount_point: disk.mount_point().to_string_lossy().into_owned(),
            file_system: disk.file_system().to_string_lossy().into_owned(),
            kind: match disk.kind() {
                DiskKind::SSD => DiskType::Ssd,
                DiskKind::HDD => DiskType::Hdd,
                DiskKind::Unknown(_) => DiskType::Unknown,
            },
            total_bytes: disk.total_space() as f64,
            available_bytes: disk.available_space() as f64,
            removable: disk.is_removable(),
        })
        .collect();
    disks.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    disks
}

/// Interfaces that exist only inside this machine (containers, VMs, Apple's peer links).
fn is_virtual_interface(name: &str) -> bool {
    const PREFIXES: &[&str] = &[
        "docker",
        "veth",
        "br-",
        "virbr",
        "vmnet",
        "vboxnet",
        "utun",
        "awdl",
        "llw",
        "anpi",
        "gif",
        "stf",
        "bridge",
        "vethernet",
        "loopback",
        "isatap",
        "teredo",
    ];
    let name = name.to_ascii_lowercase();
    // `lo`, `lo0`; but not Windows' "Local Area Connection".
    let loopback = name
        .strip_prefix("lo")
        .is_some_and(|rest| rest.bytes().all(|b| b.is_ascii_digit()));
    loopback || PREFIXES.iter().any(|prefix| name.starts_with(prefix))
}

/// Addresses a person would recognize as "this computer on the network", IPv4 first.
fn local_addresses(addresses: impl IntoIterator<Item = IpAddr>) -> Vec<String> {
    let mut usable: Vec<IpAddr> = addresses
        .into_iter()
        .filter(|address| !address.is_loopback() && !address.is_unspecified())
        .filter(|address| match address {
            IpAddr::V4(v4) => !v4.is_link_local(),
            // fe80::/10
            IpAddr::V6(v6) => (v6.segments()[0] & 0xffc0) != 0xfe80,
        })
        .collect();
    usable.sort_by_key(|address| (address.is_ipv6(), *address));
    usable.dedup();
    usable.iter().map(ToString::to_string).collect()
}

fn networks() -> Vec<NetworkInfo> {
    let mut networks: Vec<NetworkInfo> = Networks::new_with_refreshed_list()
        .iter()
        .filter(|(name, _)| !is_virtual_interface(name))
        .map(|(name, data)| NetworkInfo {
            name: name.clone(),
            addresses: local_addresses(data.ip_networks().iter().map(|network| network.addr)),
        })
        .filter(|network| !network.addresses.is_empty())
        .collect();
    networks.sort_by(|a, b| a.name.cmp(&b.name));
    networks
}

/// Health outside 1..=110 % means the battery firmware reported garbage.
fn plausible_health(health_percent: f64) -> Option<f64> {
    (1.0..=110.0)
        .contains(&health_percent)
        .then_some(health_percent.min(100.0))
}

fn battery() -> Option<BatteryInfo> {
    let manager = starship_battery::Manager::new().ok()?;
    let battery = manager.batteries().ok()?.flatten().next()?;
    Some(BatteryInfo {
        charge_percent: f64::from(battery.state_of_charge().get::<percent>()),
        state: match battery.state() {
            starship_battery::State::Charging => BatteryState::Charging,
            starship_battery::State::Discharging => BatteryState::Discharging,
            starship_battery::State::Full => BatteryState::Full,
            starship_battery::State::Empty => BatteryState::Empty,
            starship_battery::State::Paused => BatteryState::Paused,
            starship_battery::State::Unknown => BatteryState::Unknown,
        },
        health_percent: plausible_health(f64::from(battery.state_of_health().get::<percent>())),
        cycle_count: battery.cycle_count(),
        seconds_to_full: battery.time_to_full().map(|t| f64::from(t.get::<second>())),
        seconds_to_empty: battery
            .time_to_empty()
            .map(|t| f64::from(t.get::<second>())),
    })
}

/// Collects the snapshot. Blocking; call it off the main thread.
#[allow(clippy::cast_precision_loss)] // Byte counts above 2^53 are not a practical concern.
pub fn collect() -> SystemInfo {
    let mut system = System::new();
    system.refresh_memory();
    system.refresh_cpu_list(CpuRefreshKind::nothing().with_frequency());

    let first_cpu = system.cpus().first();
    let cpu_brand = first_cpu
        .map(|cpu| cpu.brand().trim().to_owned())
        .filter(|brand| !brand.is_empty());
    let cpu_frequency_mhz = first_cpu
        .map(sysinfo::Cpu::frequency)
        .filter(|mhz| *mhz > 0)
        .map(|mhz| mhz as f64);

    SystemInfo {
        device: device(),
        os_name: System::name(),
        os_version: System::long_os_version().or_else(System::os_version),
        kernel_version: System::kernel_version(),
        host_name: System::host_name(),
        arch: System::cpu_arch(),
        cpu_brand,
        cpu_frequency_mhz,
        logical_cores: to_u32(system.cpus().len().max(1)),
        physical_cores: System::physical_core_count().map(to_u32),
        total_memory_bytes: system.total_memory() as f64,
        total_swap_bytes: system.total_swap() as f64,
        uptime_seconds: System::uptime() as f64,
        disks: disks(),
        networks: networks(),
        battery: battery(),
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
    use std::net::{Ipv4Addr, Ipv6Addr};

    #[test]
    fn collects_plausible_values() {
        let info = collect();
        assert_ne!(info.arch, "");
        assert!(info.logical_cores >= 1);
        assert!(info.total_memory_bytes > 0.0);
        if let Some(physical) = info.physical_cores {
            assert!(physical >= 1 && physical <= info.logical_cores);
        }
        for disk in &info.disks {
            assert!(disk.total_bytes > 0.0);
            assert!(disk.available_bytes <= disk.total_bytes);
        }
        for network in &info.networks {
            assert_ne!(network.addresses.len(), 0);
        }
        if let Some(battery) = info.battery {
            assert!((0.0..=100.0).contains(&battery.charge_percent));
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

    #[test]
    fn clean_drops_firmware_placeholders() {
        assert_eq!(
            clean(Some("  MacBook Pro  ".into())),
            Some("MacBook Pro".into())
        );
        assert_eq!(clean(Some("To Be Filled By O.E.M.".into())), None);
        assert_eq!(clean(Some("System Product Name".into())), None);
        assert_eq!(clean(Some("   ".into())), None);
        assert_eq!(clean(None), None);
    }

    #[test]
    fn join_vendor_avoids_repeating_the_vendor() {
        let s = |v: &str| Some(v.to_owned());
        assert_eq!(
            join_vendor(s("ASUS"), s("ROG STRIX B550-F")),
            s("ASUS ROG STRIX B550-F")
        );
        assert_eq!(
            join_vendor(s("Gigabyte"), s("GIGABYTE B650 AORUS")),
            s("GIGABYTE B650 AORUS")
        );
        assert_eq!(join_vendor(None, s("Z790")), s("Z790"));
        assert_eq!(join_vendor(s("MSI"), None), None);
    }

    #[test]
    fn hides_system_and_virtual_volumes() {
        assert!(is_user_volume(Path::new("/"), "apfs"));
        assert!(is_user_volume(Path::new("C:\\"), "NTFS"));
        assert!(is_user_volume(Path::new("/Volumes/Backup"), "exfat"));
        assert!(!is_user_volume(Path::new("/System/Volumes/Data"), "apfs"));
        assert!(!is_user_volume(Path::new("/snap/core/1"), "squashfs"));
        assert!(!is_user_volume(Path::new("/boot/efi"), "vfat"));
        assert!(!is_user_volume(Path::new("/run"), "tmpfs"));
    }

    #[test]
    fn recognizes_virtual_interfaces() {
        for name in [
            "lo",
            "lo0",
            "docker0",
            "utun3",
            "awdl0",
            "vEthernet (WSL)",
            "veth12ab",
        ] {
            assert!(is_virtual_interface(name), "{name}");
        }
        for name in [
            "Ethernet",
            "Wi-Fi",
            "Local Area Connection 2",
            "en0",
            "wlp2s0",
            "enp3s0",
        ] {
            assert!(!is_virtual_interface(name), "{name}");
        }
    }

    #[test]
    fn local_addresses_skip_loopback_and_link_local() {
        let addresses = [
            IpAddr::V6(Ipv6Addr::new(0x2a02, 1, 0, 0, 0, 0, 0, 5)),
            IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20)),
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            IpAddr::V4(Ipv4Addr::new(169, 254, 3, 4)),
            IpAddr::V6(Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 1)),
            IpAddr::V4(Ipv4Addr::new(10, 0, 0, 7)),
            IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20)),
        ];
        assert_eq!(
            local_addresses(addresses),
            ["10.0.0.7", "192.168.1.20", "2a02:1::5"]
        );
    }

    #[test]
    fn battery_health_must_be_plausible() {
        assert_eq!(plausible_health(87.5), Some(87.5));
        assert_eq!(plausible_health(104.0), Some(100.0));
        assert_eq!(plausible_health(0.0), None);
        assert_eq!(plausible_health(3000.0), None);
        assert_eq!(plausible_health(f64::NAN), None);
    }
}
