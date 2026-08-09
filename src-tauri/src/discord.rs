use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "easy-pl";
const ACCOUNT: &str = "discord-bot-token";
const API: &str = "https://discord.com/api/v10";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscordUser {
    pub id: String,
    pub username: String,
    pub display_name: String,
}

#[derive(Deserialize)]
struct RawUser {
    id: String,
    username: String,
    global_name: Option<String>,
}

#[derive(Deserialize)]
struct RawMember {
    user: RawUser,
    nick: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscordChannel {
    pub id: String,
    pub name: String,
}

#[derive(Deserialize)]
struct RawChannel {
    id: String,
    name: Option<String>,
    #[serde(rename = "type")]
    kind: u8,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscordReaction {
    pub key: String,
    pub label: String,
    pub count: u32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscordMessage {
    pub id: String,
    pub author: String,
    pub content: String,
    pub timestamp: String,
    pub reactions: Vec<DiscordReaction>,
}

#[derive(Deserialize)]
struct RawEmoji {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct RawReaction {
    count: u32,
    emoji: RawEmoji,
}

#[derive(Deserialize)]
struct RawMessage {
    id: String,
    content: String,
    timestamp: String,
    author: RawUser,
    reactions: Option<Vec<RawReaction>>,
}

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|error| format!("Хранилище паролей недоступно: {error}"))
}

fn token() -> Result<String, String> {
    entry()?
        .get_password()
        .map_err(|_| "Токен бота не сохранён — укажите его в настройках".to_string())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Не удалось создать HTTP-клиент: {error}"))
}

async fn get(url: &str) -> Result<reqwest::Response, String> {
    let response = client()?
        .get(url)
        .header("Authorization", format!("Bot {}", token()?))
        .header("User-Agent", "easy-pl (https://localhost, 0.1.0)")
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() || error.is_connect() {
                "Discord недоступен. Проверьте, включён ли VPN".to_string()
            } else {
                format!("Ошибка запроса: {error}")
            }
        })?;

    match response.status().as_u16() {
        200 => Ok(response),
        401 => Err("Discord отклонил токен бота — проверьте его в настройках".to_string()),
        403 => Err(
            "Discord отказал в доступе. Проверьте, что бот добавлен на сервер, \
             включён Server Members Intent и у бота есть доступ к каналу"
                .to_string(),
        ),
        404 => Err("Discord не нашёл сервер, канал или сообщение — проверьте идентификаторы".to_string()),
        429 => Err("Discord просит подождать: слишком много запросов".to_string()),
        code => Err(format!("Discord вернул ошибку {code}")),
    }
}

fn to_user(user: RawUser, nick: Option<String>) -> DiscordUser {
    let display_name = nick
        .or(user.global_name.clone())
        .unwrap_or_else(|| user.username.clone());

    DiscordUser {
        id: user.id,
        username: user.username,
        display_name,
    }
}

#[tauri::command]
pub fn discord_save_token(token: String) -> Result<(), String> {
    let trimmed = token.trim();

    if trimmed.is_empty() {
        return Err("Токен пустой".to_string());
    }

    entry()?
        .set_password(trimmed)
        .map_err(|error| format!("Не удалось сохранить токен: {error}"))
}

#[tauri::command]
pub fn discord_clear_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Не удалось удалить токен: {error}")),
    }
}

#[tauri::command]
pub fn discord_has_token() -> bool {
    token().is_ok()
}

#[tauri::command]
pub async fn discord_check(guild_id: String) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Guild {
        name: String,
    }

    let guild: Guild = get(&format!("{API}/guilds/{guild_id}"))
        .await?
        .json()
        .await
        .map_err(|error| format!("Не удалось разобрать ответ Discord: {error}"))?;

    Ok(guild.name)
}

#[tauri::command]
pub async fn discord_list_members(guild_id: String) -> Result<Vec<DiscordUser>, String> {
    let mut members = Vec::new();
    let mut after = String::from("0");

    loop {
        let url = format!("{API}/guilds/{guild_id}/members?limit=1000&after={after}");
        let page: Vec<RawMember> = get(&url)
            .await?
            .json()
            .await
            .map_err(|error| format!("Не удалось разобрать список участников: {error}"))?;

        if page.is_empty() {
            break;
        }

        after = page
            .last()
            .map(|member| member.user.id.clone())
            .unwrap_or_default();

        for member in page {
            members.push(to_user(member.user, member.nick));
        }

        if members.len() >= 5000 {
            break;
        }
    }

    Ok(members)
}

#[tauri::command]
pub async fn discord_list_channels(guild_id: String) -> Result<Vec<DiscordChannel>, String> {
    let channels: Vec<RawChannel> = get(&format!("{API}/guilds/{guild_id}/channels"))
        .await?
        .json()
        .await
        .map_err(|error| format!("Не удалось разобрать список каналов: {error}"))?;

    let mut text_channels: Vec<DiscordChannel> = channels
        .into_iter()
        .filter(|channel| channel.kind == 0 || channel.kind == 5)
        .map(|channel| DiscordChannel {
            id: channel.id,
            name: channel.name.unwrap_or_else(|| "без названия".to_string()),
        })
        .collect();

    text_channels.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(text_channels)
}

#[tauri::command]
pub async fn discord_list_messages(channel_id: String, limit: u8) -> Result<Vec<DiscordMessage>, String> {
    let capped = limit.clamp(1, 50);
    let messages: Vec<RawMessage> = get(&format!("{API}/channels/{channel_id}/messages?limit={capped}"))
        .await?
        .json()
        .await
        .map_err(|error| format!("Не удалось разобрать сообщения: {error}"))?;

    Ok(messages
        .into_iter()
        .map(|message| DiscordMessage {
            id: message.id,
            author: message
                .author
                .global_name
                .clone()
                .unwrap_or_else(|| message.author.username.clone()),
            content: message.content,
            timestamp: message.timestamp,
            reactions: message
                .reactions
                .unwrap_or_default()
                .into_iter()
                .map(to_reaction)
                .collect(),
        })
        .collect())
}

fn to_reaction(reaction: RawReaction) -> DiscordReaction {
    let name = reaction.emoji.name.unwrap_or_else(|| "?".to_string());

    match reaction.emoji.id {
        Some(id) => DiscordReaction {
            key: format!("{name}:{id}"),
            label: format!(":{name}:"),
            count: reaction.count,
        },
        None => DiscordReaction {
            key: name.clone(),
            label: name,
            count: reaction.count,
        },
    }
}

#[tauri::command]
pub async fn discord_reaction_users(
    channel_id: String,
    message_id: String,
    emoji: String,
) -> Result<Vec<DiscordUser>, String> {
    let encoded = urlencoding::encode(emoji.trim());
    let mut users = Vec::new();
    let mut after = String::from("0");

    loop {
        let url = format!(
            "{API}/channels/{channel_id}/messages/{message_id}/reactions/{encoded}?limit=100&after={after}"
        );
        let page: Vec<RawUser> = get(&url)
            .await?
            .json()
            .await
            .map_err(|error| format!("Не удалось разобрать список реакций: {error}"))?;

        if page.is_empty() {
            break;
        }

        after = page.last().map(|user| user.id.clone()).unwrap_or_default();

        for user in page {
            users.push(to_user(user, None));
        }

        if users.len() >= 2000 {
            break;
        }
    }

    Ok(users)
}
