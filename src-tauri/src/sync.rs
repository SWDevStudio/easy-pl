use keyring::Entry;

const SERVICE: &str = "easy-pl";
const ACCOUNT: &str = "sync-token";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|error| format!("Хранилище паролей недоступно: {error}"))
}

fn token() -> Result<String, String> {
    entry()?
        .get_password()
        .map_err(|_| "Ключ синхронизации не сохранён — укажите его в настройках".to_string())
}

#[tauri::command]
pub fn sync_save_token(token: String) -> Result<(), String> {
    let trimmed = token.trim();

    if trimmed.is_empty() {
        return Err("Ключ пустой".to_string());
    }

    entry()?
        .set_password(trimmed)
        .map_err(|error| format!("Не удалось сохранить ключ: {error}"))
}

#[tauri::command]
pub fn sync_clear_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Не удалось удалить ключ: {error}")),
    }
}

#[tauri::command]
pub fn sync_has_token() -> bool {
    token().is_ok()
}

#[tauri::command]
pub fn sync_get_token() -> Result<String, String> {
    token()
}

#[tauri::command]
pub async fn sync_request(url: String, payload: String) -> Result<String, String> {
    let endpoint = url.trim().trim_end_matches('/').to_string();

    if endpoint.is_empty() {
        return Err("Не указан адрес сервера синхронизации".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Не удалось создать HTTP-клиент: {error}"))?;

    let response = client
        .post(format!("{endpoint}/sync"))
        .header("Authorization", format!("Bearer {}", token()?))
        .header("Content-Type", "application/json")
        .body(payload)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() || error.is_connect() {
                "Сервер синхронизации недоступен. Проверьте адрес и подключение".to_string()
            } else {
                format!("Ошибка запроса: {error}")
            }
        })?;

    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Не удалось прочитать ответ: {error}"))?;

    match status {
        200 => Ok(body),
        401 => Err("Сервер отклонил ключ синхронизации".to_string()),
        404 => Err("Адрес указывает не на сервер синхронизации".to_string()),
        code => Err(format!("Сервер вернул ошибку {code}: {body}")),
    }
}
