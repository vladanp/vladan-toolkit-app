//! Graphics cards for the System Info page, plus displays on macOS (where the OS reports
//! their refresh rate). The frontend lists displays itself everywhere else.
//!
//! Each OS has its own source: `system_profiler` on macOS, the display adapter entries in
//! the registry on Windows, `lspci` on Linux. The parsers are plain functions, compiled
//! and tested on every platform.

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use specta::Type;

#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphicsInfo {
    pub gpus: Vec<GpuInfo>,
    /// Filled on macOS only.
    pub displays: Vec<DisplayInfo>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vendor: Option<String>,
    /// Dedicated video memory. `None` for GPUs that share system memory (Apple silicon).
    pub memory_bytes: Option<f64>,
    /// GPU cores, as Apple reports them.
    pub cores: Option<u32>,
    /// In the vendor's own numbering where we know it (NVIDIA "560.94", AMD Adrenalin).
    pub driver_version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    pub name: String,
    /// Physical pixels.
    pub width: u32,
    pub height: u32,
    /// Physical pixels per point (2 on Retina screens).
    pub scale: f64,
    pub refresh_hz: Option<f64>,
    pub primary: bool,
    pub builtin: bool,
}

/// How long an external tool may take before we give up on it.
#[cfg_attr(windows, allow(dead_code))]
const TOOL_TIMEOUT: Duration = Duration::from_secs(10);

/// Runs a program and returns its standard output, or `None` if it is missing, fails or
/// does not finish within `timeout` (it is killed then).
#[cfg_attr(windows, allow(dead_code))]
fn run_with_timeout(program: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    // Drain stdout on a thread so a chatty program can't block on a full pipe.
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut output = String::new();
        stdout.read_to_string(&mut output).map(|_| output)
    });
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            Ok(Some(_)) => return None,
            Ok(None) | Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    reader.join().ok()?.ok()
}

/// `"Advanced Micro Devices, Inc. [AMD/ATI]"` → `"AMD"`, `"sppci_vendor_Apple"` → `"Apple"`.
fn short_vendor(raw: &str) -> String {
    let raw = raw.trim().trim_start_matches("sppci_vendor_");
    let lower = raw.to_ascii_lowercase();
    if lower.starts_with("nvidia") {
        "NVIDIA".into()
    } else if lower.contains("advanced micro devices")
        || lower.starts_with("amd")
        || lower.starts_with("ati")
    {
        "AMD".into()
    } else if lower.starts_with("intel") {
        "Intel".into()
    } else if lower.starts_with("apple") {
        "Apple".into()
    } else {
        // "Qualcomm (0x5143)" → "Qualcomm"
        raw.split(" (0x").next().unwrap_or(raw).trim().to_owned()
    }
}

/// Software adapters Windows installs for remote sessions and fallback rendering.
#[cfg_attr(not(windows), allow(dead_code))]
fn is_virtual_adapter(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [
        "microsoft basic",
        "microsoft remote display",
        "virtual display",
        "parsec virtual",
        "citrix",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

/// NVIDIA's own version from the Windows driver version: `32.0.15.6094` → `560.94`.
#[cfg_attr(not(windows), allow(dead_code))]
fn nvidia_driver_version(windows_version: &str) -> Option<String> {
    let parts: Vec<&str> = windows_version.trim().split('.').collect();
    let [.., third, fourth] = parts.as_slice() else {
        return None;
    };
    let digits = format!("{third}{fourth}");
    if digits.len() < 5 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let last = &digits[digits.len() - 5..];
    Some(format!("{}.{}", &last[..3], &last[3..]))
}

/// The version a person would look up: NVIDIA's release number, AMD's Adrenalin version,
/// or the Windows driver version for everyone else.
#[cfg_attr(not(windows), allow(dead_code))]
fn driver_version(
    vendor: Option<&str>,
    windows_version: Option<String>,
    amd_software: Option<String>,
) -> Option<String> {
    match vendor {
        Some("NVIDIA") => windows_version
            .as_deref()
            .and_then(nvidia_driver_version)
            .or(windows_version),
        Some("AMD") => amd_software
            .filter(|v| !v.trim().is_empty())
            .or(windows_version),
        _ => windows_version,
    }
}

/// Little-endian 4 or 8 byte registry values (`REG_BINARY` memory sizes).
#[cfg_attr(not(windows), allow(dead_code))]
fn le_bytes_to_u64(bytes: &[u8]) -> Option<u64> {
    match bytes.len() {
        4 => Some(u64::from(u32::from_le_bytes(bytes.try_into().ok()?))),
        8 => Some(u64::from_le_bytes(bytes.try_into().ok()?)),
        _ => None,
    }
}

/// `"8 GB"`, `"1536 MB"` → bytes.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_memory_size(text: &str) -> Option<f64> {
    let mut parts = text.split_whitespace();
    let amount: f64 = parts.next()?.parse().ok()?;
    let unit = match parts.next()?.to_ascii_uppercase().as_str() {
        "KB" => 1024.0,
        "MB" => 1024.0 * 1024.0,
        "GB" => 1024.0 * 1024.0 * 1024.0,
        "TB" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    (amount > 0.0).then_some(amount * unit)
}

/// Leading digits of `text`, ignoring leading spaces.
fn leading_number(text: &str) -> Option<u32> {
    let digits: String = text
        .trim_start()
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    digits.parse().ok()
}

/// `"3024 x 1964"` (anything may follow the height) → `(3024, 1964)`.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_size(text: &str) -> Option<(u32, u32)> {
    let (width, height) = text.split_once(" x ")?;
    Some((leading_number(width)?, leading_number(height)?))
}

/// `"1512 x 982 @ 120.00Hz"` → `(1512, 982, Some(120.0))`.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_resolution(text: &str) -> Option<(u32, u32, Option<f64>)> {
    let (size, refresh) = match text.split_once('@') {
        Some((size, refresh)) => (size, Some(refresh)),
        None => (text, None),
    };
    let (width, height) = parse_size(size)?;
    let refresh_hz = refresh
        .and_then(|r| r.trim().trim_end_matches("Hz").trim().parse::<f64>().ok())
        .filter(|hz| *hz > 0.0);
    Some((width, height, refresh_hz))
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_display(value: &Value) -> Option<DisplayInfo> {
    let name = text(value, "_name")?;
    let (ui_width, ui_height, refresh_hz) = parse_resolution(
        text(value, "_spdisplays_resolution").or(text(value, "spdisplays_resolution"))?,
    )?;
    let (width, height) = text(value, "_spdisplays_pixels")
        .or(text(value, "spdisplays_pixels"))
        .and_then(parse_size)
        .unwrap_or((ui_width, ui_height));
    let builtin = text(value, "spdisplays_connection_type") == Some("spdisplays_internal")
        || text(value, "spdisplays_display_type").is_some_and(|t| t.contains("built-in"));
    Some(DisplayInfo {
        // Apple calls the built-in panel "Color LCD".
        name: if builtin && name == "Color LCD" {
            "Built-in display".into()
        } else {
            name.into()
        },
        width,
        height,
        scale: if ui_width > 0 {
            f64::from(width) / f64::from(ui_width)
        } else {
            1.0
        },
        refresh_hz,
        primary: text(value, "spdisplays_main") == Some("spdisplays_yes"),
        builtin,
    })
}

/// Parses `system_profiler -json SPDisplaysDataType`.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_system_profiler(json: &str) -> Option<GraphicsInfo> {
    let root: Value = serde_json::from_str(json).ok()?;
    let mut info = GraphicsInfo::default();
    for card in root.get("SPDisplaysDataType")?.as_array()? {
        let Some(name) = text(card, "sppci_model").or(text(card, "_name")) else {
            continue;
        };
        info.gpus.push(GpuInfo {
            name: name.to_owned(),
            vendor: text(card, "spdisplays_vendor")
                .or(text(card, "sppci_vendor"))
                .map(short_vendor),
            memory_bytes: ["spdisplays_vram", "_spdisplays_vram"]
                .iter()
                .find_map(|key| text(card, key))
                .and_then(parse_memory_size),
            cores: text(card, "sppci_cores").and_then(|cores| cores.parse().ok()),
            driver_version: None,
        });
        let displays = card.get("spdisplays_ndrvs").and_then(Value::as_array);
        info.displays
            .extend(displays.into_iter().flatten().filter_map(parse_display));
    }
    Some(info)
}

/// Parses `lspci -mm`: quoted fields, the first three being class, vendor and device.
#[cfg_attr(any(target_os = "macos", windows), allow(dead_code))]
fn parse_lspci(output: &str) -> Vec<GpuInfo> {
    output
        .lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split('"').skip(1).step_by(2).collect();
            let [class, vendor, device, ..] = fields.as_slice() else {
                return None;
            };
            if ![
                "VGA compatible controller",
                "3D controller",
                "Display controller",
            ]
            .contains(class)
            {
                return None;
            }
            // "GA106 [GeForce RTX 3060]" → the marketing name in brackets.
            let name = device
                .rsplit_once('[')
                .and_then(|(_, rest)| rest.strip_suffix(']'))
                .unwrap_or(device);
            Some(GpuInfo {
                name: name.trim().to_owned(),
                vendor: Some(short_vendor(vendor)),
                memory_bytes: None,
                cores: None,
                driver_version: None,
            })
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn collect_platform() -> GraphicsInfo {
    run_with_timeout(
        "/usr/sbin/system_profiler",
        &["-json", "SPDisplaysDataType"],
        TOOL_TIMEOUT,
    )
    .and_then(|json| parse_system_profiler(&json))
    .unwrap_or_default()
}

#[cfg(windows)]
#[allow(clippy::cast_precision_loss)] // Video memory is far below 2^53 bytes.
fn collect_platform() -> GraphicsInfo {
    use windows_registry::LOCAL_MACHINE;

    /// The "Display adapters" device class.
    const CLASS: &str =
        r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

    let Ok(class) = LOCAL_MACHINE.open(CLASS) else {
        return GraphicsInfo::default();
    };
    let Ok(ids) = class.keys() else {
        return GraphicsInfo::default();
    };
    let mut gpus: Vec<GpuInfo> = Vec::new();
    for id in ids.filter(|id| id.bytes().all(|b| b.is_ascii_digit())) {
        let Ok(key) = class.open(&id) else { continue };
        let Ok(name) = key.get_string("DriverDesc") else {
            continue;
        };
        if is_virtual_adapter(&name) || gpus.iter().any(|gpu| gpu.name == name) {
            continue;
        }
        let vendor = key
            .get_string("ProviderName")
            .ok()
            .map(|v| short_vendor(&v));
        let memory_bytes = key
            .get_u64("HardwareInformation.qwMemorySize")
            .ok()
            .or_else(|| key.get_u64("HardwareInformation.MemorySize").ok())
            .or_else(|| {
                key.get_value("HardwareInformation.MemorySize")
                    .ok()
                    .and_then(|value| le_bytes_to_u64(&value))
            })
            .filter(|bytes| *bytes > 0);
        let driver_version = driver_version(
            vendor.as_deref(),
            key.get_string("DriverVersion").ok(),
            key.get_string("RadeonSoftwareVersion").ok(),
        );
        gpus.push(GpuInfo {
            name,
            vendor,
            memory_bytes: memory_bytes.map(|bytes| bytes as f64),
            cores: None,
            driver_version,
        });
    }
    GraphicsInfo {
        gpus,
        displays: Vec::new(),
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
fn collect_platform() -> GraphicsInfo {
    GraphicsInfo {
        gpus: run_with_timeout("lspci", &["-mm"], TOOL_TIMEOUT)
            .map(|output| parse_lspci(&output))
            .unwrap_or_default(),
        displays: Vec::new(),
    }
}

/// Graphics cards (and macOS displays). Blocking; call it off the main thread.
pub fn collect() -> GraphicsInfo {
    collect_platform()
}

/// Graphics cards and, on macOS, displays. Can take a second, so it is separate from
/// [`super::system_info`].
///
/// # Errors
/// Returns an error if the worker thread panicked.
#[tauri::command]
#[specta::specta]
pub async fn system_graphics() -> Result<GraphicsInfo, String> {
    tauri::async_runtime::spawn_blocking(collect)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_without_failing() {
        let info =
            tauri::async_runtime::block_on(system_graphics()).unwrap_or_else(|e| panic!("{e}"));
        for gpu in &info.gpus {
            assert_ne!(gpu.name, "");
        }
        for display in &info.displays {
            assert!(display.width > 0 && display.height > 0);
        }
    }

    #[test]
    fn shortens_vendor_names() {
        assert_eq!(short_vendor("NVIDIA Corporation"), "NVIDIA");
        assert_eq!(
            short_vendor("Advanced Micro Devices, Inc. [AMD/ATI]"),
            "AMD"
        );
        assert_eq!(short_vendor("ATI Technologies Inc."), "AMD");
        assert_eq!(short_vendor("Intel Corporation"), "Intel");
        assert_eq!(short_vendor("sppci_vendor_Apple"), "Apple");
        assert_eq!(short_vendor("sppci_vendor_amd"), "AMD");
        assert_eq!(short_vendor("Qualcomm (0x5143)"), "Qualcomm");
    }

    #[test]
    fn skips_virtual_adapters() {
        assert!(is_virtual_adapter("Microsoft Basic Display Adapter"));
        assert!(is_virtual_adapter("Microsoft Remote Display Adapter"));
        assert!(is_virtual_adapter("Parsec Virtual Display Adapter"));
        assert!(!is_virtual_adapter("NVIDIA GeForce RTX 4070"));
    }

    #[test]
    fn converts_nvidia_driver_versions() {
        assert_eq!(
            nvidia_driver_version("32.0.15.6094").as_deref(),
            Some("560.94")
        );
        assert_eq!(
            nvidia_driver_version("31.0.15.5222").as_deref(),
            Some("552.22")
        );
        assert_eq!(nvidia_driver_version("1.2"), None);
        assert_eq!(nvidia_driver_version("32.0.1x.6094"), None);
    }

    #[test]
    fn picks_the_driver_version_people_know() {
        let v = |s: &str| Some(s.to_owned());
        assert_eq!(
            driver_version(Some("NVIDIA"), v("32.0.15.6094"), None),
            v("560.94")
        );
        assert_eq!(driver_version(Some("NVIDIA"), v("weird"), None), v("weird"));
        assert_eq!(
            driver_version(Some("AMD"), v("31.0.24033.1003"), v("24.10.1")),
            v("24.10.1")
        );
        assert_eq!(
            driver_version(Some("AMD"), v("31.0.24033.1003"), v(" ")),
            v("31.0.24033.1003")
        );
        assert_eq!(
            driver_version(Some("Intel"), v("32.0.101.6083"), None),
            v("32.0.101.6083")
        );
        assert_eq!(driver_version(None, None, None), None);
    }

    #[test]
    fn decodes_little_endian_registry_values() {
        assert_eq!(le_bytes_to_u64(&[0, 0, 0, 0x80]), Some(0x8000_0000));
        assert_eq!(
            le_bytes_to_u64(&[0, 0, 0, 0, 2, 0, 0, 0]),
            Some(0x2_0000_0000)
        );
        assert_eq!(le_bytes_to_u64(&[1, 2]), None);
    }

    #[test]
    fn parses_sizes_and_resolutions() {
        assert_eq!(
            parse_memory_size("8 GB"),
            Some(8.0 * 1024.0 * 1024.0 * 1024.0)
        );
        assert_eq!(parse_memory_size("1536 MB"), Some(1536.0 * 1024.0 * 1024.0));
        assert_eq!(parse_memory_size("lots"), None);
        assert_eq!(parse_memory_size("8 parsecs"), None);
        assert_eq!(
            parse_resolution("1512 x 982 @ 120.00Hz"),
            Some((1512, 982, Some(120.0)))
        );
        assert_eq!(
            parse_resolution("2560 x 1440 @ 59.95 Hz"),
            Some((2560, 1440, Some(59.95)))
        );
        assert_eq!(
            parse_resolution("2560 x 1440 (QHD/WQHD - Wide Quad High Definition)"),
            Some((2560, 1440, None))
        );
        assert_eq!(parse_resolution("unknown"), None);
    }

    const MACBOOK: &str = r#"{
      "SPDisplaysDataType": [{
        "_name": "Apple M3 Pro",
        "sppci_cores": "18",
        "sppci_model": "Apple M3 Pro",
        "spdisplays_vendor": "sppci_vendor_Apple",
        "spdisplays_ndrvs": [
          {
            "_name": "Color LCD",
            "_spdisplays_pixels": "3024 x 1964",
            "_spdisplays_resolution": "1512 x 982 @ 120.00Hz",
            "spdisplays_connection_type": "spdisplays_internal",
            "spdisplays_main": "spdisplays_yes"
          },
          {
            "_name": "DELL S2721DGF",
            "_spdisplays_pixels": "2560 x 1440",
            "_spdisplays_resolution": "2560 x 1440 @ 165.00Hz"
          },
          { "_name": "Broken" }
        ]
      }, {
        "_name": "AMD Radeon Pro 5500M",
        "spdisplays_vram": "8 GB",
        "spdisplays_vendor": "sppci_vendor_amd"
      }, {
        "spdisplays_vendor": "nameless"
      }]
    }"#;

    #[test]
    fn parses_system_profiler_output() {
        let info = parse_system_profiler(MACBOOK).unwrap_or_else(|| panic!("no info"));
        assert_eq!(
            info.gpus,
            [
                GpuInfo {
                    name: "Apple M3 Pro".into(),
                    vendor: Some("Apple".into()),
                    memory_bytes: None,
                    cores: Some(18),
                    driver_version: None,
                },
                GpuInfo {
                    name: "AMD Radeon Pro 5500M".into(),
                    vendor: Some("AMD".into()),
                    memory_bytes: Some(8.0 * 1024.0 * 1024.0 * 1024.0),
                    cores: None,
                    driver_version: None,
                },
            ]
        );
        assert_eq!(
            info.displays,
            [
                DisplayInfo {
                    name: "Built-in display".into(),
                    width: 3024,
                    height: 1964,
                    scale: 2.0,
                    refresh_hz: Some(120.0),
                    primary: true,
                    builtin: true,
                },
                DisplayInfo {
                    name: "DELL S2721DGF".into(),
                    width: 2560,
                    height: 1440,
                    scale: 1.0,
                    refresh_hz: Some(165.0),
                    primary: false,
                    builtin: false,
                },
            ]
        );
        assert!(parse_system_profiler("not json").is_none());
        assert!(parse_system_profiler("{}").is_none());
    }

    #[test]
    fn parses_lspci_output() {
        let output = concat!(
            "00:02.0 \"VGA compatible controller\" \"Intel Corporation\" \"Alder Lake-P GT2 [Iris Xe Graphics]\" -r0c \"Lenovo\" \"Device 3f1d\"\n",
            "01:00.0 \"3D controller\" \"NVIDIA Corporation\" \"GA107M [GeForce RTX 3050 Mobile]\" -ra1\n",
            "00:1f.3 \"Audio device\" \"Intel Corporation\" \"Alder Lake PCH-P High Definition Audio\"\n",
            "00:01.0 \"Display controller\" \"Red Hat, Inc.\" \"Virtio GPU\"\n",
            "garbage\n",
        );
        let names: Vec<(String, Option<String>)> = parse_lspci(output)
            .into_iter()
            .map(|gpu| (gpu.name, gpu.vendor))
            .collect();
        assert_eq!(
            names,
            [
                ("Iris Xe Graphics".to_owned(), Some("Intel".to_owned())),
                (
                    "GeForce RTX 3050 Mobile".to_owned(),
                    Some("NVIDIA".to_owned())
                ),
                ("Virtio GPU".to_owned(), Some("Red Hat, Inc.".to_owned())),
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn runs_tools_with_a_timeout() {
        let second = Duration::from_secs(5);
        assert_eq!(
            run_with_timeout("sh", &["-c", "echo hi"], second).as_deref(),
            Some("hi\n")
        );
        assert_eq!(run_with_timeout("sh", &["-c", "exit 3"], second), None);
        assert_eq!(
            run_with_timeout("definitely-not-a-program", &[], second),
            None
        );
        let started = Instant::now();
        assert_eq!(
            run_with_timeout("sleep", &["5"], Duration::from_millis(100)),
            None
        );
        assert!(started.elapsed() < Duration::from_secs(3));
    }
}
