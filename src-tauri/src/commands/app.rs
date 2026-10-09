use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Runtime, State};

/// Static information about the running build, shown in Settings → About.
/// Computed once at startup and served from managed state.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub tauri_version: String,
    pub webview_version: Option<String>,
    pub os: String,
    pub arch: String,
    pub updater_enabled: bool,
}

impl AppInfo {
    #[must_use]
    pub fn collect<R: Runtime>(app: &AppHandle<R>, updater_enabled: bool) -> Self {
        let package = app.package_info();
        Self {
            name: package.name.clone(),
            version: package.version.to_string(),
            tauri_version: tauri::VERSION.to_owned(),
            webview_version: tauri::webview_version().ok(),
            os: std::env::consts::OS.to_owned(),
            arch: std::env::consts::ARCH.to_owned(),
            updater_enabled,
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn app_info(info: State<'_, AppInfo>) -> AppInfo {
    info.inner().clone()
}

#[cfg(test)]
mod tests {
    use super::AppInfo;
    use tauri::Manager;
    use tauri::test::{INVOKE_KEY, get_ipc_response, mock_builder, mock_context, noop_assets};
    use tauri::webview::InvokeRequest;
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    #[test]
    fn app_info_over_ipc() {
        let app = mock_builder()
            .invoke_handler(crate::specta_builder().invoke_handler())
            .build(mock_context(noop_assets()))
            .unwrap_or_else(|e| panic!("failed to build app: {e}"));
        app.manage(AppInfo::collect(app.handle(), false));
        let webview = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .unwrap_or_else(|e| panic!("failed to build webview: {e}"));

        let response = get_ipc_response(
            &webview,
            InvokeRequest {
                cmd: "app_info".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                // The app's own origin; Windows and Android serve it over http.
                url: if cfg!(any(windows, target_os = "android")) {
                    "http://tauri.localhost"
                } else {
                    "tauri://localhost"
                }
                .parse()
                .unwrap_or_else(|e| panic!("url: {e}")),
                body: tauri::ipc::InvokeBody::default(),
                headers: tauri::http::HeaderMap::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .unwrap_or_else(|e| panic!("ipc failed: {e:?}"));

        let info: serde_json::Value = response
            .deserialize()
            .unwrap_or_else(|e| panic!("bad payload: {e}"));
        assert_eq!(info["os"], std::env::consts::OS);
        assert_eq!(info["arch"], std::env::consts::ARCH);
        assert_eq!(info["tauriVersion"], tauri::VERSION);
        assert_eq!(info["updaterEnabled"], false);
        assert!(info["version"].as_str().is_some_and(|v| !v.is_empty()));
    }
}
