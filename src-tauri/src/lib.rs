use feed_rs::parser;
use futures_util::StreamExt;
use reqwest::{redirect::Policy, Client};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    net::{IpAddr, Ipv6Addr},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{ipc::Channel, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_sql::{Migration, MigrationKind};
use url::Url;

const MAX_REMOTE_BYTES: usize = 2 * 1024 * 1024;
const DEEPSEEK_URL: &str = "https://api.deepseek.com/chat/completions";

#[tauri::command]
fn read_dropped_text(paths: Vec<String>) -> Result<Vec<String>, String> {
    paths
        .into_iter()
        .take(8)
        .map(|path| {
            let lower = path.to_ascii_lowercase();
            if !(lower.ends_with(".txt") || lower.ends_with(".md") || lower.ends_with(".markdown")) {
                return Err("小安子只接收 .txt 或 .md 文本文件".to_string());
            }
            let metadata = fs::metadata(&path).map_err(|_| "无法读取拖入文件".to_string())?;
            if metadata.len() > 1_048_576 {
                return Err("拖入文件超过 1MB 限制".to_string());
            }
            fs::read_to_string(&path).map_err(|_| "拖入文件不是可读取的 UTF-8 文本".to_string())
        })
        .collect()
}

#[derive(Default)]
struct CancellationRegistry(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FeedResult {
    title: String,
    items: Vec<FeedItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FeedItem {
    external_id: String,
    title: String,
    summary: String,
    url: String,
    published_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebSnapshot {
    title: String,
    summary: String,
    url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct DeepSeekMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssistantRequest {
    request_id: String,
    api_key: String,
    model: String,
    thinking_enabled: bool,
    messages: Vec<DeepSeekMessage>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
enum StreamEvent {
    Chunk { content: String },
    Done {},
    Error { message: String },
}

fn is_forbidden_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_documentation()
                || ip.is_unspecified()
                || ip.octets()[0] == 0
        }
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
                || is_ipv6_documentation(ip)
        }
    }
}

fn is_ipv6_documentation(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();
    segments[0] == 0x2001 && segments[1] == 0x0db8
}

async fn validate_public_https(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "奏报地址格式不正确".to_string())?;
    if url.scheme() != "https" {
        return Err("为保护本机，只允许 HTTPS 地址".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("地址中不能包含用户名或密码".into());
    }
    let host = url.host_str().ok_or_else(|| "地址缺少域名".to_string())?;
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") {
        return Err("不能访问本机地址".into());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_forbidden_ip(ip) {
            return Err("不能访问内网或保留地址".into());
        }
    } else {
        let port = url.port_or_known_default().unwrap_or(443);
        let resolved: Vec<_> = tokio::net::lookup_host((host, port))
            .await
            .map_err(|_| "无法解析该来源域名".to_string())?
            .collect();
        if resolved.is_empty() || resolved.iter().any(|address| is_forbidden_ip(address.ip())) {
            return Err("来源域名指向内网或保留地址".into());
        }
    }
    Ok(url)
}

fn remote_client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .redirect(Policy::limited(3))
        .user_agent("Yuan/0.1 (+local-first RSS reader)")
        .build()
        .map_err(|_| "无法建立网络连接".to_string())
}

async fn fetch_limited(url: Url) -> Result<Vec<u8>, String> {
    let response = remote_client(15)?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("获取来源失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("来源返回 HTTP {}", response.status().as_u16()));
    }
    if response.content_length().unwrap_or(0) > MAX_REMOTE_BYTES as u64 {
        return Err("来源内容超过 2MB 限制".into());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "读取来源内容失败".to_string())?;
        if bytes.len() + chunk.len() > MAX_REMOTE_BYTES {
            return Err("来源内容超过 2MB 限制".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn clean_text(input: &str, limit: usize) -> String {
    let normalized = input.split_whitespace().collect::<Vec<_>>().join(" ");
    normalized.chars().take(limit).collect()
}

#[tauri::command]
async fn fetch_feed(url: String) -> Result<FeedResult, String> {
    let safe_url = validate_public_https(&url).await?;
    let bytes = fetch_limited(safe_url).await?;
    let feed =
        parser::parse(&bytes[..]).map_err(|_| "该地址不是有效的 RSS 或 Atom 来源".to_string())?;
    let title = feed
        .title
        .map(|value| value.content)
        .unwrap_or_else(|| "未命名奏报".into());
    let items = feed
        .entries
        .into_iter()
        .take(100)
        .filter_map(|entry| {
            let link = entry
                .links
                .first()
                .map(|value| value.href.clone())
                .unwrap_or_default();
            let title = entry
                .title
                .map(|value| clean_text(&value.content, 240))
                .unwrap_or_default();
            if title.is_empty() || link.is_empty() {
                return None;
            }
            let summary = entry
                .summary
                .map(|value| clean_text(&value.content, 600))
                .unwrap_or_default();
            let published = entry
                .published
                .or(entry.updated)
                .map(|value| value.to_rfc3339());
            Some(FeedItem {
                external_id: if entry.id.is_empty() {
                    link.clone()
                } else {
                    entry.id
                },
                title,
                summary,
                url: link,
                published_at: published,
            })
        })
        .collect();
    Ok(FeedResult { title, items })
}

#[tauri::command]
async fn fetch_web_snapshot(url: String) -> Result<WebSnapshot, String> {
    let safe_url = validate_public_https(&url).await?;
    let final_url = safe_url.to_string();
    let bytes = fetch_limited(safe_url).await?;
    let source = String::from_utf8_lossy(&bytes);
    let document = Html::parse_document(&source);
    let title_selector = Selector::parse("title").expect("static selector");
    let paragraph_selector = Selector::parse("article p, main p, body p").expect("static selector");
    let title = document
        .select(&title_selector)
        .next()
        .map(|node| clean_text(&node.text().collect::<Vec<_>>().join(" "), 180))
        .unwrap_or_default();
    let mut parts = Vec::new();
    let mut length = 0;
    for paragraph in document.select(&paragraph_selector) {
        let text = clean_text(&paragraph.text().collect::<Vec<_>>().join(" "), 700);
        if text.len() < 20 || length + text.len() > 4_000 {
            continue;
        }
        length += text.len();
        parts.push(text);
    }
    let summary = clean_text(&parts.join(" "), 1_000);
    Ok(WebSnapshot {
        title: if title.is_empty() {
            "未命名网页".into()
        } else {
            title
        },
        summary: if summary.is_empty() {
            "该网页未提供可读取的正文摘要。".into()
        } else {
            summary
        },
        url: final_url,
    })
}

fn deepseek_payload(request: &AssistantRequest, stream: bool, json_output: bool) -> Value {
    let mut payload = json!({
      "model": request.model,
      "messages": request.messages,
      "stream": stream,
      "thinking": { "type": if request.thinking_enabled { "enabled" } else { "disabled" } },
      "max_tokens": if json_output { 4096 } else { 2048 }
    });
    if json_output {
        payload["response_format"] = json!({ "type": "json_object" });
    }
    payload
}

fn deepseek_error(status: u16, body: &str) -> String {
    match status {
        401 | 403 => "DeepSeek API Key 无效或无权限".into(),
        429 => "DeepSeek 请求过于频繁，请稍后再试".into(),
        500..=599 => "DeepSeek 服务暂时繁忙，请稍后再试".into(),
        _ => {
            let safe = clean_text(body, 160);
            if safe.is_empty() {
                format!("DeepSeek 返回 HTTP {status}")
            } else {
                format!("DeepSeek 返回 HTTP {status}：{safe}")
            }
        }
    }
}

#[tauri::command]
async fn deepseek_stream(
    request: AssistantRequest,
    on_event: Channel<StreamEvent>,
    registry: State<'_, CancellationRegistry>,
) -> Result<(), String> {
    if !matches!(
        request.model.as_str(),
        "deepseek-v4-flash" | "deepseek-v4-pro"
    ) {
        return Err("不受支持的 DeepSeek 模型".into());
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    registry
        .0
        .lock()
        .map_err(|_| "请求状态异常".to_string())?
        .insert(request.request_id.clone(), cancelled.clone());
    let result = async {
        let response = remote_client(120)?
            .post(DEEPSEEK_URL)
            .bearer_auth(&request.api_key)
            .json(&deepseek_payload(&request, true, false))
            .send()
            .await
            .map_err(|error| format!("连接 DeepSeek 失败：{error}"))?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.text().await.unwrap_or_default();
            return Err(deepseek_error(status, &body));
        }
        let mut pending = Vec::<u8>::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            if cancelled.load(Ordering::Relaxed) {
                break;
            }
            pending.extend_from_slice(&chunk.map_err(|_| "读取 DeepSeek 响应失败".to_string())?);
            while let Some(index) = pending.iter().position(|byte| *byte == b'\n') {
                let line: Vec<u8> = pending.drain(..=index).collect();
                let line = String::from_utf8_lossy(&line);
                let data = line.trim().strip_prefix("data: ").unwrap_or_default();
                if data.is_empty() || data == "[DONE]" {
                    continue;
                }
                if let Ok(value) = serde_json::from_str::<Value>(data) {
                    if let Some(content) = value
                        .pointer("/choices/0/delta/content")
                        .and_then(Value::as_str)
                    {
                        if !content.is_empty() {
                            let _ = on_event.send(StreamEvent::Chunk {
                                content: content.into(),
                            });
                        }
                    }
                }
            }
        }
        let _ = on_event.send(StreamEvent::Done {});
        Ok(())
    }
    .await;
    if let Ok(mut values) = registry.0.lock() {
        values.remove(&request.request_id);
    }
    if let Err(message) = &result {
        let _ = on_event.send(StreamEvent::Error {
            message: message.clone(),
        });
    }
    result
}

#[tauri::command]
fn cancel_deepseek(
    request_id: String,
    registry: State<'_, CancellationRegistry>,
) -> Result<(), String> {
    if let Some(cancelled) = registry
        .0
        .lock()
        .map_err(|_| "请求状态异常".to_string())?
        .get(&request_id)
    {
        cancelled.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
async fn deepseek_json(request: AssistantRequest) -> Result<Value, String> {
    if !matches!(
        request.model.as_str(),
        "deepseek-v4-flash" | "deepseek-v4-pro"
    ) {
        return Err("不受支持的 DeepSeek 模型".into());
    }
    let response = remote_client(120)?
        .post(DEEPSEEK_URL)
        .bearer_auth(&request.api_key)
        .json(&deepseek_payload(&request, false, true))
        .send()
        .await
        .map_err(|error| format!("连接 DeepSeek 失败：{error}"))?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(deepseek_error(status, &body));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|_| "DeepSeek 返回了无法解析的内容".to_string())?;
    let content = body
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| "DeepSeek 未返回整理内容".to_string())?;
    serde_json::from_str(content).map_err(|_| "DeepSeek 整理结果不是有效 JSON".to_string())
}

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_local_first_schema",
        kind: MigrationKind::Up,
        sql: r#"
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL, priority TEXT NOT NULL, due_at TEXT, tags_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS concerns (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, raw_text TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL, source_url TEXT, tags_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL,
        content_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_checked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_concerns_hash ON concerns(content_hash);
      CREATE TABLE IF NOT EXISTS content_sources (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1, last_fetched_at TEXT, last_error TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS news_items (
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL, external_id TEXT NOT NULL, title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, published_at TEXT, fetched_at TEXT NOT NULL,
        matched_concern_ids_json TEXT NOT NULL DEFAULT '[]',
        UNIQUE(source_id, external_id), FOREIGN KEY(source_id) REFERENCES content_sources(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at DESC, fetched_at DESC);
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
    "#,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CancellationRegistry::default())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:yuan.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let salt_path = app.path().app_local_data_dir()?.join("stronghold-salt.txt");
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Warn)
                        .build(),
                )?;
            }
            let mut pet_builder = WebviewWindowBuilder::new(app, "pet", WebviewUrl::App("index.html#/pet".into()))
                .title("小安子")
                .inner_size(230.0, 320.0)
                .min_inner_size(210.0, 280.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false);
            if let Some(monitor) = app.primary_monitor()? {
                let scale = monitor.scale_factor();
                let work = monitor.work_area();
                let x = (work.position.x as f64 + work.size.width as f64 - 250.0 * scale) / scale;
                let y = (work.position.y as f64 + work.size.height as f64 - 350.0 * scale) / scale;
                pet_builder = pet_builder.position(x.max(0.0), y.max(0.0));
            }
            pet_builder.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_feed,
            fetch_web_snapshot,
            deepseek_stream,
            cancel_deepseek,
            deepseek_json,
            read_dropped_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running 御案");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn blocks_private_ipv4_ranges() {
        assert!(is_forbidden_ip(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))));
        assert!(is_forbidden_ip(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 10))));
        assert!(!is_forbidden_ip(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))));
    }

    #[test]
    fn redacts_common_deepseek_errors() {
        assert_eq!(
            deepseek_error(401, "secret response"),
            "DeepSeek API Key 无效或无权限"
        );
        assert_eq!(deepseek_error(429, ""), "DeepSeek 请求过于频繁，请稍后再试");
    }

    #[test]
    fn cleans_remote_text() {
        assert_eq!(clean_text("  hello\n  world  ", 40), "hello world");
    }
}
