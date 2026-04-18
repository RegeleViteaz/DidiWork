// Minimal Tauri 2 application entry point.
// The frontend runs in a WebView2 window and uses browser localStorage
// for persistence (no Rust-side state or files required).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
