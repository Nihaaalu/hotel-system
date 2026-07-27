#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

// Tauri commands can go here if needed.
// For SQLite, Tauri provides standard plugin-based SQL queries, so the Rust code
// simply bootstraps the main window setup and injects the Tauri plugins.

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
