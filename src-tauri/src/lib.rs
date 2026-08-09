mod sync;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            sync::sync_save_token,
            sync::sync_clear_token,
            sync::sync_has_token,
            sync::sync_get_token,
            sync::sync_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
