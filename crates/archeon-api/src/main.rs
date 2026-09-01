mod cad;

use archeon_agents::{
    authorize_commit, authorize_tx, critic_notes, parse_command, roster,
    memory::{LocalMemoryProvider, MemoryProvider},
    provider, AgentCard, ViewCommand,
};
use archeon_assembly::{explode_document, ExplosionStrategy};
use archeon_design_ir::{load_project_dir, DesignDocument, Revision};
use archeon_transactions::{
    apply_operations, dry_run, DesignTransaction, Ledger, TxStatus, UserDecision,
};
use archeon_validation::validate;
use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    env, net::SocketAddr, path::PathBuf, sync::{Arc, Mutex},
};
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};

const BIND: ([u8; 4], u16) = ([127, 0, 0, 1], 8799);

struct App {
    root: PathBuf,
    project_dir: PathBuf,
    doc: Mutex<DesignDocument>,
    ledger: Mutex<Ledger>,
    proposal: Mutex<Option<ProposalState>>,
    logs: Mutex<Vec<String>>,
    memory: LocalMemoryProvider,
}

struct ProposalState {
    tx: DesignTransaction,
    preview: DesignDocument,
}

#[derive(Clone)]
struct AppState(Arc<App>);

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "info,archeon_api=debug".into()))
        .json()
        .init();

    let root = find_root();
    let rel = env::var("ARCHEON_PROJECT").unwrap_or_else(|_| "projects/archeon-arm".into());
    let project_dir = if PathBuf::from(&rel).is_absolute() {
        PathBuf::from(&rel)
    } else {
        root.join(&rel)
    };
    let doc = load_project_dir(&project_dir).unwrap_or_else(|e| {
        eprintln!("failed to load {}: {e}", project_dir.display());
        std::process::exit(1);
    });
    tracing::info!(
        event = "api.start",
        project = %doc.project.id.as_str(),
        revision = %doc.project.revision_id,
        hash = %doc.design_hash()
    );

    let memory_dir = root.join(env::var("ARCHEON_MEMORY_DIR").unwrap_or_else(|_| "memory".into()));
    let app = Arc::new(App {
        root: root.clone(),
        project_dir,
        doc: Mutex::new(doc),
        ledger: Mutex::new(Ledger::default()),
        proposal: Mutex::new(None),
        logs: Mutex::new(vec![]),
        memory: LocalMemoryProvider::new(memory_dir),
    });

    let ui = root.join("apps").join("workstation").join("dist");
    let mut router = Router::new()
        .route("/api/health", get(health))
        .route("/api/project", get(project))
        .route("/api/design", get(design))
        .route("/api/entities", get(entities))
        .route("/api/assembly", get(assembly))
        .route("/api/interfaces", get(interfaces))
        .route("/api/requirements", get(requirements))
        .route("/api/transactions", get(transactions))
        .route("/api/agents", get(agents))
        .route("/api/validation", get(validation_now))
        .route("/api/memory/status", get(memory_status))
        .route("/api/cad/status", get(cad_status))
        .route("/api/commands", post(commands))
        .route("/api/transactions/propose", post(propose))
        .route("/api/transactions/validate", post(validate_tx))
        .route("/api/transactions/commit", post(commit_tx))
        .route("/api/transactions/reject", post(reject_tx))
        .route("/api/agents/run", post(agents_run))
        .route("/api/agents/chat", post(agents_chat))
        .route("/api/cad/regenerate", post(cad_regen))
        .route("/api/memory/remember", post(memory_remember))
        .route("/api/memory/query", post(memory_query))
        .with_state(AppState(app))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    if ui.join("index.html").is_file() {
        router = router.fallback_service(ServeDir::new(ui));
    }

    let bind = env::var("ARCHEON_BIND").unwrap_or_else(|_| format!("127.0.0.1:{}", BIND.1));
    let addr: SocketAddr = bind.parse().expect("ARCHEON_BIND");
    tracing::info!(event = "api.listen", %addr);
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, router).await.expect("serve");
}

fn find_root() -> PathBuf {
    if let Ok(v) = env::var("ARCHEON_ROOT") {
        return PathBuf::from(v);
    }
    let mut p = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for _ in 0..8 {
        if p.join("projects").is_dir() && p.join("Cargo.toml").is_file() {
            return p;
        }
        if !p.pop() {
            break;
        }
    }
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn log_line(app: &App, event: &str, msg: &str) {
    let line = format!("{} {event} {msg}", Utc::now().to_rfc3339());
    tracing::info!(event, message = msg);
    if let Ok(mut g) = app.logs.lock() {
        g.push(line);
        if g.len() > 400 {
            let excess = g.len() - 400;
            g.drain(0..excess);
        }
    }
}

async fn health(State(st): State<AppState>) -> Json<Value> {
    let doc = st.0.doc.lock().unwrap();
    Json(json!({
        "product": archeon_design_ir::PRODUCT,
        "version": archeon_design_ir::VERSION,
        "status": "ok",
        "project": doc.project.name,
        "revision": doc.project.revision_id,
        "kernel": doc.project.kernel,
        "provider": provider::info(),
        "phase": "1-semantic-assembly"
    }))
}

async fn project(State(st): State<AppState>) -> Json<Value> {
    let doc = st.0.doc.lock().unwrap();
    let proposal = st.0.proposal.lock().unwrap();
    Json(json!({
        "project": doc.project,
        "hash": doc.design_hash(),
        "reach_m": doc.derived_reach_m(),
        "proposal": proposal.as_ref().map(|p| json!({
            "transaction": p.tx,
            "preview_hash": p.preview.design_hash(),
            "reach_m": p.preview.derived_reach_m(),
            "preview_parts": p.preview.parts
        })),
        "provider": provider::info(),
        "agents": roster().iter().map(|a| a.id.clone()).collect::<Vec<_>>(),
        "logs": st.0.logs.lock().unwrap().clone()
    }))
}

async fn design(State(st): State<AppState>) -> Json<DesignDocument> {
    Json(st.0.doc.lock().unwrap().clone())
}

async fn entities(State(st): State<AppState>) -> Json<Value> {
    let doc = st.0.doc.lock().unwrap();
    Json(json!({ "ids": doc.all_ids() }))
}

async fn assembly(State(st): State<AppState>) -> Json<Value> {
    let doc = st.0.doc.lock().unwrap();
    Json(json!({
        "assemblies": doc.assemblies,
        "parts": doc.parts,
        "sequence": doc.assembly_sequence,
        "explosion_preview": explode_document(&doc, ExplosionStrategy::Sequence, 0.7)
    }))
}

async fn interfaces(State(st): State<AppState>) -> Json<Value> {
    let doc = st.0.doc.lock().unwrap();
    Json(json!({ "interfaces": doc.interfaces, "ports": doc.ports, "mates": doc.mates }))
}

async fn requirements(State(st): State<AppState>) -> Json<Value> {
    let doc = st.0.doc.lock().unwrap();
    Json(json!({ "requirements": doc.requirements, "critic": critic_notes(&doc) }))
}

async fn transactions(State(st): State<AppState>) -> Json<Ledger> {
    Json(st.0.ledger.lock().unwrap().clone())
}

async fn agents() -> Json<Vec<AgentCard>> {
    Json(roster())
}

async fn validation_now(State(st): State<AppState>) -> Json<Value> {
    let doc = st.0.doc.lock().unwrap();
    Json(serde_json::to_value(validate(&doc)).unwrap())
}

async fn memory_status(State(st): State<AppState>) -> Json<Value> {
    Json(json!({
        "local": st.0.memory.status(),
        "cortex": archeon_agents::memory::CortexMemoryProvider.status()
    }))
}

async fn cad_status(State(st): State<AppState>) -> Json<cad::CadStatus> {
    Json(cad::ping(&st.0.root).await)
}

#[derive(Deserialize)]
struct ChatIn {
    message: String,
    #[serde(default)]
    agent_id: Option<String>,
}

async fn commands(State(st): State<AppState>, Json(body): Json<ChatIn>) -> Json<Value> {
    handle_chat(st, body).await
}

async fn agents_chat(State(st): State<AppState>, Json(body): Json<ChatIn>) -> Json<Value> {
    handle_chat(st, body).await
}

async fn agents_run(State(st): State<AppState>, Json(body): Json<ChatIn>) -> Json<Value> {
    handle_chat(st, body).await
}

async fn handle_chat(st: AppState, body: ChatIn) -> Json<Value> {
    let app = st.0;
    log_line(
        &app,
        "agent.run",
        &format!("agent={} chat: {}", body.agent_id.as_deref().unwrap_or("operator"), body.message),
    );
    let doc = app.doc.lock().unwrap().clone();
    let parsed = parse_command(&body.message, &doc);

    if let Some(mut tx) = parsed.tx {
        match authorize_tx(&tx.agent_id, &tx) {
            Ok(()) => match dry_run(&doc, &tx) {
                Ok(preview) => {
                    tx.geometry_hash_before = Some(doc.design_hash());
                    tx.geometry_hash_after = Some(preview.design_hash());
                    let report = validate(&preview);
                    tx.validation_results = vec![serde_json::to_value(&report).unwrap_or(json!({}))];
                    let _ = tx.transition(TxStatus::Validating);
                    let next = if report.ok() { TxStatus::Valid } else { TxStatus::Invalid };
                    let _ = tx.transition(next);
                    log_line(&app, "transaction.propose", &tx.transaction_id);
                    let id = tx.transaction_id.clone();
                    app.ledger.lock().unwrap().push(tx.clone());
                    *app.proposal.lock().unwrap() = Some(ProposalState { tx: tx.clone(), preview });
                    return Json(json!({
                        "reply": format!("Proposed {} — status {:?}. APPROVE / REJECT required.", tx.intent, tx.status),
                        "views": parsed.views,
                        "notes": parsed.notes,
                        "transaction": tx,
                        "transaction_id": id,
                        "provider": "local-dtp"
                    }));
                }
                Err(e) => {
                    return Json(json!({ "reply": format!("Dry-run failed: {e}"), "views": parsed.views, "notes": parsed.notes }));
                }
            },
            Err(e) => {
                return Json(json!({ "reply": format!("Unauthorized: {e}"), "views": parsed.views, "notes": parsed.notes }));
            }
        }
    }

    if parsed.action.as_deref() == Some("validate") {
        return validate_inner(&app, None);
    }
    if parsed.action.as_deref() == Some("commit") {
        if let Some(id) = app.proposal.lock().unwrap().as_ref().map(|p| p.tx.transaction_id.clone()) {
            return commit_inner(&app, &id, "operator");
        }
        return Json(json!({ "reply": "No proposal to commit.", "views": parsed.views, "notes": parsed.notes }));
    }
    if parsed.action.as_deref() == Some("reject") {
        if let Some(id) = app.proposal.lock().unwrap().as_ref().map(|p| p.tx.transaction_id.clone()) {
            return reject_inner(&app, &id);
        }
    }

    let reply = if parsed.views.is_empty() && parsed.notes.iter().any(|n| n.contains("No local")) {
        let sys = "You are an ARCHEON engineering copilot. Do not claim FEA, collision-free, or prices. Do not mutate design state. Suggest DTP operations only.";
        provider::complete(sys, &[archeon_agents::provider::ChatMessage { role: "user".into(), content: body.message.clone() }])
            .await
            .unwrap_or_else(|e| format!("provider error: {e}"))
    } else {
        parsed.notes.join("\n")
    };

    Json(json!({
        "reply": reply,
        "views": parsed.views,
        "notes": parsed.notes,
        "critic": critic_notes(&doc),
        "provider": provider::info()
    }))
}

#[derive(Deserialize)]
struct ProposeIn {
    agent_id: String,
    intent: String,
    reason: String,
    operations: Vec<archeon_transactions::Operation>,
}

async fn propose(State(st): State<AppState>, Json(body): Json<ProposeIn>) -> Result<Json<Value>, (StatusCode, String)> {
    let mut tx = DesignTransaction::propose(&body.agent_id, &body.intent, &body.reason, body.operations);
    authorize_tx(&body.agent_id, &tx).map_err(|e| (StatusCode::FORBIDDEN, e.to_string()))?;
    let doc = st.0.doc.lock().unwrap().clone();
    let preview = dry_run(&doc, &tx).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    tx.geometry_hash_before = Some(doc.design_hash());
    tx.geometry_hash_after = Some(preview.design_hash());
    let report = validate(&preview);
    tx.validation_results = vec![serde_json::to_value(&report).unwrap_or(json!({}))];
    let _ = tx.transition(TxStatus::Validating);
    let _ = tx.transition(if report.ok() { TxStatus::Valid } else { TxStatus::Invalid });
    log_line(&st.0, "transaction.propose", &tx.transaction_id);
    st.0.ledger.lock().unwrap().push(tx.clone());
    *st.0.proposal.lock().unwrap() = Some(ProposalState { tx: tx.clone(), preview });
    Ok(Json(json!({ "transaction": tx })))
}

#[derive(Deserialize)]
struct IdIn {
    transaction_id: Option<String>,
    #[serde(default)]
    agent_id: Option<String>,
}

async fn validate_tx(State(st): State<AppState>, Json(body): Json<IdIn>) -> Json<Value> {
    validate_inner(&st.0, body.transaction_id.as_deref())
}

fn validate_inner(app: &App, id: Option<&str>) -> Json<Value> {
    let doc = app.doc.lock().unwrap().clone();
    let base = validate(&doc);
    let prop = app.proposal.lock().unwrap();
    let preview = if let Some(p) = prop.as_ref() {
        if id.is_none() || id == Some(p.tx.transaction_id.as_str()) {
            Some(validate(&p.preview))
        } else {
            None
        }
    } else {
        None
    };
    log_line(app, "validation", "graph validators (not FEA, not exact collision)");
    Json(json!({
        "canonical": base,
        "proposal": preview,
        "note": "Graph validators only. AABB/FEA/OCCT interference are separate and may be unavailable."
    }))
}

async fn commit_tx(State(st): State<AppState>, Json(body): Json<IdIn>) -> Json<Value> {
    let id = match body.transaction_id {
        Some(id) => id,
        None => return Json(json!({"error":"transaction_id required"})),
    };
    commit_inner(&st.0, &id, body.agent_id.as_deref().unwrap_or("operator"))
}

fn commit_inner(app: &App, id: &str, agent: &str) -> Json<Value> {
    if let Err(e) = authorize_commit(agent) {
        return Json(json!({"error": e.to_string()}));
    }
    let mut proposal = app.proposal.lock().unwrap();
    let Some(p) = proposal.as_mut() else {
        return Json(json!({"error":"no proposal"}));
    };
    if p.tx.transaction_id != id {
        return Json(json!({"error":"transaction mismatch"}));
    }
    if p.tx.status != TxStatus::Valid && p.tx.status != TxStatus::Approved {
        return Json(json!({"error": format!("cannot commit from {:?}", p.tx.status)}));
    }
    let _ = p.tx.transition(TxStatus::Approved);
    let _ = p.tx.transition(TxStatus::Committed);
    p.tx.user_decision = UserDecision::Approve;
    let mut doc = app.doc.lock().unwrap();
    if let Err(e) = apply_operations(&mut doc, &p.tx.operations) {
        return Json(json!({"error": e.to_string()}));
    }
    let rev = next_revision(&doc.project.revision_id);
    let parent = doc.project.revision_id.clone();
    let tx_id = p.tx.transaction_id.clone();
    let agent_name = p.tx.agent_id.clone();
    let message = p.tx.intent.clone();
    let geom = p.tx.geometry_hash_after.clone();
    doc.project.revision_id = rev.clone();
    let hash = doc.design_hash();
    doc.revisions.push(Revision {
        id: rev.clone(),
        parent_revision: Some(parent),
        transaction_id: Some(tx_id),
        timestamp: Utc::now().to_rfc3339(),
        author: agent.into(),
        agent: Some(agent_name),
        message,
        geometry_hash: geom,
        design_hash: Some(hash.clone()),
    });
    log_line(app, "transaction.commit", &format!("{id} -> {rev} hash={hash}"));
    let tx = p.tx.clone();
    if let Some(slot) = app.ledger.lock().unwrap().get_mut(id) {
        *slot = tx.clone();
    }
    *proposal = None;
    Json(json!({ "committed": tx, "revision": rev, "hash": hash }))
}

async fn reject_tx(State(st): State<AppState>, Json(body): Json<IdIn>) -> Json<Value> {
    let id = body.transaction_id.unwrap_or_default();
    reject_inner(&st.0, &id)
}

fn reject_inner(app: &App, id: &str) -> Json<Value> {
    let mut proposal = app.proposal.lock().unwrap();
    if let Some(p) = proposal.as_mut() {
        if id.is_empty() || p.tx.transaction_id == id {
            let _ = p.tx.transition(TxStatus::Rejected);
            p.tx.user_decision = UserDecision::Reject;
            let tx = p.tx.clone();
            if let Some(slot) = app.ledger.lock().unwrap().get_mut(&tx.transaction_id) {
                *slot = tx.clone();
            }
            log_line(app, "transaction.reject", &tx.transaction_id);
            *proposal = None;
            return Json(json!({ "rejected": tx }));
        }
    }
    Json(json!({"error":"no matching proposal"}))
}

fn next_revision(current: &str) -> String {
    if let Some(n) = current.strip_prefix("rev.") {
        if let Ok(i) = n.parse::<u32>() {
            return format!("rev.{:04}", i + 1);
        }
    }
    "rev.0002".into()
}

async fn cad_regen(State(st): State<AppState>) -> Json<Value> {
    log_line(&st.0, "cad.regen", "requested");
    match cad::regenerate(&st.0.root, &st.0.project_dir).await {
        Ok(v) => Json(v),
        Err(e) => Json(json!({ "ok": false, "error": e, "note": "UI geometry remains a DesignIR projection until CAD succeeds." })),
    }
}

#[derive(Deserialize)]
struct MemIn {
    kind: String,
    text: String,
}

async fn memory_remember(State(st): State<AppState>, Json(body): Json<MemIn>) -> Json<Value> {
    match st.0.memory.remember(&body.kind, &body.text) {
        Ok(h) => Json(json!(h)),
        Err(e) => Json(json!({"error": e})),
    }
}

#[derive(Deserialize)]
struct QueryIn {
    query: String,
    #[serde(default)]
    limit: Option<usize>,
}

async fn memory_query(State(st): State<AppState>, Json(body): Json<QueryIn>) -> Json<Value> {
    match st.0.memory.query(&body.query, body.limit.unwrap_or(8)) {
        Ok(h) => Json(json!(h)),
        Err(e) => Json(json!({"error": e})),
    }
}

#[allow(dead_code)]
fn _use_view(v: &ViewCommand) {
    let _ = v;
}
