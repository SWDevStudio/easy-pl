mod discord;
mod sync;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            discord::discord_save_token,
            discord::discord_clear_token,
            discord::discord_has_token,
            discord::discord_check,
            discord::discord_list_members,
            discord::discord_list_channels,
            discord::discord_list_messages,
            discord::discord_reaction_users,
            sync::sync_save_token,
            sync::sync_clear_token,
            sync::sync_has_token,
            sync::sync_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
