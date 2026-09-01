//! Replaceable AI providers. UI never calls a vendor SDK.
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub model: String,
    pub configured: bool,
    pub note: String,
}

pub fn info() -> ProviderInfo {
    let key = api_key();
    let provider = env::var("ARCHEON_AI_PROVIDER").unwrap_or_else(|_| {
        if key.is_some() {
            "openai-compatible".into()
        } else {
            "mock".into()
        }
    });
    let model = env::var("ARCHEON_AI_MODEL").unwrap_or_else(|_| "grok-4.5".into());
    let configured = key.is_some() && provider != "mock";
    ProviderInfo {
        id: provider,
        model,
        configured,
        note: if configured {
            "OpenAI-compatible adapter (default SpaceXAI / xAI when key present).".into()
        } else {
            "MockProvider active. Deterministic local commands still work.".into()
        },
    }
}

fn api_key() -> Option<String> {
    env::var("ARCHEON_AI_API_KEY")
        .ok()
        .or_else(|| env::var("XAI_API_KEY").ok())
        .filter(|s| !s.trim().is_empty())
}

pub async fn complete(system: &str, messages: &[ChatMessage]) -> Result<String, String> {
    let meta = info();
    if meta.id == "mock" || !meta.configured {
        return Ok(mock_reply(messages));
    }
    openai_compatible(system, messages, &meta).await
}

fn mock_reply(messages: &[ChatMessage]) -> String {
    let last = messages.last().map(|m| m.content.as_str()).unwrap_or("");
    format!(
        "MockProvider (no API key). Local engineering commands are handled by the agent SDK.\n\
         I will not invent prices, FEA, or CAD claims.\n\
         Last utterance: {}",
        last.chars().take(280).collect::<String>()
    )
}

async fn openai_compatible(
    system: &str,
    messages: &[ChatMessage],
    meta: &ProviderInfo,
) -> Result<String, String> {
    let key = api_key().ok_or("missing API key")?;
    let base = env::var("ARCHEON_AI_BASE_URL").unwrap_or_else(|_| "https://api.x.ai/v1".into());
    let url = format!("{}/chat/completions", base.trim_end_matches('/'));
    let mut msgs = vec![serde_json::json!({"role":"system","content":system})];
    for m in messages {
        msgs.push(serde_json::json!({"role": m.role, "content": m.content}));
    }
    let body = serde_json::json!({
        "model": meta.model,
        "messages": msgs,
        "temperature": 0.2
    });
    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let v: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("provider {status}: {v}"));
    }
    v["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "provider returned no content".into())
}
