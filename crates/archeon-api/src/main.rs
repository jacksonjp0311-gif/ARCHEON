mod cad;
mod compiler;
mod live;
mod projects;

use archeon_agents::{
    authorize_commit, authorize_tx, critic_notes, execute_tool,
    memory::{LocalMemoryProvider, MemoryProvider},
    parse_command_ctx, provider, roster, AgentCard, EngineeringToolCall, OperatorContext,
    ViewCommand,
};
use archeon_assembly::{explode_document, ExplosionStrategy};
use archeon_design_ir::{load_project_dir, save_project_dir, DesignDocument, Revision};
use archeon_live::{pick_heuristic_best, three_length_variants, tracked_deltas, LiveDesignSession};
use archeon_transactions::{
    apply_operations, dry_run, dry_run_with_diff, DesignTransaction, Ledger, TxError, TxStatus,
    UserDecision,
};
use archeon_validation::validate;
use axum::{
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    env,
    net::SocketAddr,
    path::PathBuf,
    process::Command,
    sync::{Arc, Mutex},
};
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};

const BIND: ([u8; 4], u16) = ([127, 0, 0, 1], 8799);

struct App {
    root: PathBuf,
    project_dir: Mutex<PathBuf>,
    doc: Mutex<DesignDocument>,
    ledger: Mutex<Ledger>,
    proposal: Mutex<Option<ProposalState>>,
    logs: Mutex<Vec<String>>,
    memory: LocalMemoryProvider,
    live: live::LiveRuntime,
}

struct ProposalState {
    tx: DesignTransaction,
    preview: DesignDocument,
}

#[derive(Clone)]
struct AppState(Arc<App>);

struct LaunchOpts {
    open_browser: bool,
    print_version_only: bool,
}

fn parse_opts() -> LaunchOpts {
    let mut open_browser = env::var("ARCHEON_NO_OPEN").ok().as_deref() != Some("1");
    let mut print_version_only = false;
    for arg in env::args().skip(1) {
        match arg.as_str() {
            "--version" | "-V" => print_version_only = true,
            "--no-open" => open_browser = false,
            "--open" => open_browser = true,
            "--help" | "-h" => {
                eprintln!(
                    "ARCHEON v{version}

USAGE:
    archeon [--open | --no-open]
    archeon --version
",
                    version = compiler::product_version()
                );
                std::process::exit(0);
            }
            other => {
                eprintln!("unknown argument: {other}");
                std::process::exit(2);
            }
        }
    }
    LaunchOpts {
        open_browser,
        print_version_only,
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "info,archeon_api=debug".into()))
        .json()
        .init();

    let opts = parse_opts();
    if opts.print_version_only {
        println!("{}", compiler::product_version());
        return;
    }

    let root = find_root();
    let rel = env::var("ARCHEON_PROJECT").unwrap_or_else(|_| "projects/archeon-arm".into());
    let project_dir = if PathBuf::from(&rel).is_absolute() {
        PathBuf::from(&rel)
    } else {
        root.join(&rel)
    };
    let mut doc = load_project_dir(&project_dir).unwrap_or_else(|e| {
        eprintln!("failed to load {}: {e}", project_dir.display());
        std::process::exit(1);
    });
    projects::attach_cad_files(&mut doc, &project_dir);
    tracing::info!(
        event = "api.start",
        project = %doc.project.id.as_str(),
        revision = %doc.project.revision_id,
        hash = %doc.design_hash()
    );

    let memory_dir = root.join(env::var("ARCHEON_MEMORY_DIR").unwrap_or_else(|_| "memory".into()));
    let app = Arc::new(App {
        root: root.clone(),
        project_dir: Mutex::new(project_dir),
        doc: Mutex::new(doc),
        ledger: Mutex::new(Ledger::default()),
        proposal: Mutex::new(None),
        logs: Mutex::new(vec![]),
        memory: LocalMemoryProvider::new(memory_dir),
        live: live::LiveRuntime::new(),
    });

    let ui = compiler::find_ui_dir(&root);
    let mut router = Router::new()
        .route("/api/health", get(health))
        .route("/api/version", get(health))
        .route("/api/control/reset", post(control_reset))
        .route("/api/project", get(project))
        .route("/api/design", get(design))
        .route("/api/entities", get(entities))
        .route("/api/assembly", get(assembly))
        .route("/api/interfaces", get(interfaces))
        .route("/api/requirements", get(requirements))
        .route("/api/transactions", get(transactions))
        .route("/api/agents", get(agents))
        .route("/api/agents/tool", post(agent_tool))
        .route("/api/validation", get(validation_now))
        .route("/api/memory/status", get(memory_status))
        .route("/api/cad/status", get(cad_status))
        .route("/api/cad/import", post(cad_import))
        .route("/api/projects", get(list_projects))
        .route("/api/projects/load", post(load_project))
        .route("/api/media/{*rest}", get(media))
        .route("/api/commands", post(commands))
        .route("/api/transactions/propose", post(propose))
        .route("/api/transactions/validate", post(validate_tx))
        .route("/api/transactions/commit", post(commit_tx))
        .route("/api/transactions/reject", post(reject_tx))
        .route("/api/agents/run", post(agents_run))
        .route("/api/agents/chat", post(agents_chat))
        .route("/api/cad/regenerate", post(cad_regen))
        .route("/api/cad/jobs", get(live::jobs_list))
        .route("/api/cad/jobs/{id}", get(live::job_get))
        .route("/api/live-design/start", post(live::session_start))
        .route("/api/live-design/cancel", post(live::session_cancel))
        .route("/api/live-design", get(live::session_get))
        .route("/api/live-design/{id}", get(live::session_get_id))
        .route("/api/variants", get(live::variants_list))
        .route("/api/variants/create", post(live::variants_create))
        .route("/api/variants/{id}", get(live::variant_get))
        .route("/api/events/stream", get(live::events_stream))
        .route("/api/memory/remember", post(memory_remember))
        .route("/api/memory/query", post(memory_query))
        .with_state(AppState(app))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    if let Some(ui) = ui {
        tracing::info!(event = "ui.serve", path = %ui.display());
        router = router.fallback_service(ServeDir::new(ui));
    } else {
        tracing::warn!("no operator UI found; build apps/workstation/dist or set ARCHEON_UI_DIR");
    }

    let bind = env::var("ARCHEON_BIND").unwrap_or_else(|_| format!("127.0.0.1:{}", BIND.1));
    let addr: SocketAddr = bind.parse().expect("ARCHEON_BIND");
    tracing::info!(event = "api.listen", %addr);
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    if opts.open_browser {
        let url = format!("http://{addr}/");
        let _ = Command::new("cmd").args(["/C", "start", "", &url]).spawn();
    }
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
        "version": compiler::product_version(),
        "release": compiler::release(),
        "status": "ok",
        "project": doc.project.name,
        "revision": doc.project.revision_id,
        "kernel": doc.project.kernel,
        "provider": provider::info(),
        "phase": "1.2-live-design"
    }))
}

async fn control_reset(State(st): State<AppState>) -> (StatusCode, Json<Value>) {
    match compiler::queue_update_compiler(&st.0.root) {
        Ok(compiler) => (
            StatusCode::ACCEPTED,
            Json(json!({
                "kind": "hard",
                "version": compiler::product_version(),
                "compiler": compiler,
                "note": "Update compiler queued. The workstation will reopen through boot verification."
            })),
        ),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        ),
    }
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
        "logs": st.0.logs.lock().unwrap().clone(),
        "live": live::job_snapshot(&st.0)
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
    #[serde(default)]
    selected_id: Option<String>,
    #[serde(default)]
    focused_id: Option<String>,
    #[serde(default)]
    tracked_ids: Vec<String>,
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

async fn agent_tool(
    State(st): State<AppState>,
    Json(call): Json<EngineeringToolCall>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let doc = st.0.doc.lock().unwrap().clone();
    let mut outcome = execute_tool(call, &doc).map_err(|message| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": { "code": "INVALID_TOOL_ARGUMENT", "message": message } })),
        )
    })?;
    if let Some(mut tx) = outcome.transaction.take() {
        authorize_tx(&tx.agent_id, &tx).map_err(tx_error_response)?;
        let (preview, diff) = dry_run_with_diff(&doc, &tx).map_err(tx_error_response)?;
        tx.geometry_hash_before = Some(doc.design_hash());
        tx.geometry_hash_after = Some(preview.design_hash());
        tx.diff = Some(diff);
        let report = validate(&preview);
        tx.validation_results = vec![serde_json::to_value(&report).unwrap_or_default()];
        let _ = tx.transition(TxStatus::Validating);
        let _ = tx.transition(if report.ok() {
            TxStatus::Valid
        } else {
            TxStatus::Invalid
        });
        st.0.ledger.lock().unwrap().push(tx.clone());
        *st.0.proposal.lock().unwrap() = Some(ProposalState {
            tx: tx.clone(),
            preview,
        });
        let cad_job = tx
            .diff
            .as_ref()
            .is_some_and(|diff| !diff.geometry_affected.is_empty())
            .then(|| live::spawn_cad_job(st.clone(), Some(tx.transaction_id.clone())));
        return Ok(Json(
            json!({ "outcome": outcome, "transaction": tx, "cad_job": cad_job }),
        ));
    }
    Ok(Json(json!({ "outcome": outcome })))
}

async fn handle_chat(st: AppState, body: ChatIn) -> Json<Value> {
    let app = st.0.clone();
    log_line(
        &app,
        "agent.run",
        &format!(
            "agent={} chat: {}",
            body.agent_id.as_deref().unwrap_or("operator"),
            body.message
        ),
    );
    let doc = app.doc.lock().unwrap().clone();
    let ctx = OperatorContext {
        selected_id: body.selected_id.clone(),
        focused_id: body.focused_id.clone(),
        tracked_ids: body.tracked_ids.clone(),
    };
    let parsed = parse_command_ctx(&body.message, &doc, &ctx);

    if parsed.action.as_deref() == Some("variants") {
        let param = if body.message.to_lowercase().contains("wrist") {
            "wrist.length"
        } else {
            "upper_arm.length"
        };
        match three_length_variants(&doc, param, [25.0, 50.0, 75.0]) {
            Ok(v) => {
                *app.live.variants.lock().unwrap() = v.clone();
                live::emit_kind(
                    &app,
                    "PROPOSAL_UPDATED",
                    json!({ "variants": v.len(), "param": param }),
                );
                return Json(json!({
                    "reply": format!("Three PREVIEW variants of {param} (+25 / +50 / +75 mm). Canonical DesignIR unchanged. Not independent CAD kernels."),
                    "views": parsed.views,
                    "notes": parsed.notes,
                    "card": parsed.card,
                    "variants": v.iter().map(|x| json!({"id": x.id, "metrics": x.metrics, "status": x.status, "preview_parts": x.preview.parts})).collect::<Vec<_>>(),
                    "provider": "local-dtp"
                }));
            }
            Err(e) => {
                return Json(json!({ "reply": e, "views": parsed.views, "notes": parsed.notes }))
            }
        }
    }
    if parsed.action.as_deref() == Some("generative_inspect") && parsed.tx.is_none() {
        let session = LiveDesignSession::start_pipeline(&doc);
        let report = validate(&doc);
        *app.live.session.lock().unwrap() = Some(session.clone());
        live::emit_kind(
            &app,
            "AGENT_STARTED",
            json!({ "session_id": session.session_id, "kind": "generative_pipeline" }),
        );
        return Json(json!({
            "reply": parsed.notes.first().cloned().unwrap_or_else(|| "Shoulder generative inspect. Canonical DesignIR unchanged.".into()),
            "views": parsed.views,
            "notes": parsed.notes,
            "card": parsed.card,
            "steps": session.operations,
            "session": session,
            "findings": report.findings,
            "provider": "local-dtp"
        }));
    }
    if parsed.action.as_deref() == Some("best") {
        let vars = app.live.variants.lock().unwrap().clone();
        let id = pick_heuristic_best(&vars, 0.8);
        return Json(json!({
            "reply": format!("HEURISTIC pick: {:?}. Closest derived reach ≥ 800 mm. Not an optimizer.", id),
            "views": parsed.views,
            "notes": parsed.notes,
            "best": id,
            "provider": "local-dtp"
        }));
    }
    if parsed.action.as_deref() == Some("explain") {
        let prop = app.proposal.lock().unwrap();
        let reason = prop
            .as_ref()
            .map(|p| p.tx.reason.clone())
            .unwrap_or_else(|| "No active proposal. Nothing to explain.".into());
        let intent = prop
            .as_ref()
            .map(|p| p.tx.intent.clone())
            .unwrap_or_default();
        return Json(json!({
            "reply": format!("Decision: {intent}\nReason: {reason}\nValidation: graph only. FEA NOT RUN."),
            "views": parsed.views,
            "notes": parsed.notes,
            "card": {
                "kind": "explain",
                "title": "WHY",
                "happened": intent,
                "why": reason,
                "changed": "Proposal only until COMMIT.",
                "attention": "Do not treat this as FEA evidence.",
                "actions": [{"id":"validate","label":"VALIDATE"},{"id":"reject","label":"REJECT"}]
            },
            "provider": "local-dtp"
        }));
    }
    if parsed.action.as_deref() == Some("impact") {
        let current = doc
            .parameters
            .get("upper_arm.length")
            .map(|p| p.value)
            .unwrap_or(400.0);
        let next = (current - 25.0).max(50.0);
        let mut tx = archeon_transactions::DesignTransaction::propose(
            "cad-designer",
            &format!("Impact: upper arm {current} → {next} mm"),
            "Dry-run smaller envelope. Not committed.",
            vec![archeon_transactions::Operation::ChangeParameter {
                name: "upper_arm.length".into(),
                value: next,
                unit: Some("mm".into()),
            }],
        );
        tx.requirements = vec!["req.reach".into()];
        match dry_run(&doc, &tx) {
            Ok(preview) => {
                let reach = preview.derived_reach_m();
                let deltas = tracked_deltas(&body.tracked_ids, &doc, &preview);
                return Json(json!({
                    "reply": format!("If shorter by 25 mm, derived reach becomes {:?} m. REQ-002 is 0.8 m. Canonical unchanged.", reach),
                    "views": parsed.views,
                    "notes": parsed.notes,
                    "impact": { "reach_m": reach, "tracked": deltas },
                    "provider": "local-dtp"
                }));
            }
            Err(e) => return Json(json!({ "reply": e.to_string() })),
        }
    }

    if let Some(mut tx) = parsed.tx {
        match authorize_tx(&tx.agent_id, &tx) {
            Ok(()) => match dry_run_with_diff(&doc, &tx) {
                Ok((preview, diff)) => {
                    tx.geometry_hash_before = Some(doc.design_hash());
                    tx.geometry_hash_after = Some(preview.design_hash());
                    tx.diff = Some(diff);
                    let report = validate(&preview);
                    tx.validation_results =
                        vec![serde_json::to_value(&report).unwrap_or(json!({}))];
                    let _ = tx.transition(TxStatus::Validating);
                    let next = if report.ok() {
                        TxStatus::Valid
                    } else {
                        TxStatus::Invalid
                    };
                    let _ = tx.transition(next);
                    log_line(&app, "transaction.propose", &tx.transaction_id);
                    let id = tx.transaction_id.clone();
                    let mut session = LiveDesignSession::start(&tx.agent_id, &doc);
                    session.attach_proposal(&tx, preview.clone());
                    let deltas = tracked_deltas(&body.tracked_ids, &doc, &preview);
                    app.ledger.lock().unwrap().push(tx.clone());
                    *app.proposal.lock().unwrap() = Some(ProposalState {
                        tx: tx.clone(),
                        preview: preview.clone(),
                    });
                    *app.live.session.lock().unwrap() = Some(session.clone());
                    live::emit_kind(
                        &app,
                        "PROPOSAL_UPDATED",
                        json!({ "transaction_id": id, "session_id": session.session_id }),
                    );
                    let job = live::spawn_cad_job(st.clone(), Some(id.clone()));
                    let reply = parsed.notes.first().cloned().unwrap_or_else(|| {
                        format!("Proposed {} — status {:?}. APPROVE / REJECT required. CAD job {} is async.", tx.intent, tx.status, job.id)
                    });
                    return Json(json!({
                        "reply": reply,
                        "views": parsed.views,
                        "notes": parsed.notes,
                        "card": parsed.card,
                        "steps": session.operations,
                        "session": session,
                        "cad_job": job,
                        "tracked_changes": deltas,
                        "transaction": tx,
                        "transaction_id": id,
                        "preview_parts": preview.parts,
                        "provider": "local-dtp"
                    }));
                }
                Err(e) => {
                    return Json(
                        json!({ "reply": format!("Dry-run failed: {e}"), "views": parsed.views, "notes": parsed.notes }),
                    );
                }
            },
            Err(e) => {
                return Json(
                    json!({ "reply": format!("Unauthorized: {e}"), "views": parsed.views, "notes": parsed.notes }),
                );
            }
        }
    }

    if parsed.action.as_deref() == Some("validate") {
        return validate_inner(&app, None);
    }
    if parsed.action.as_deref() == Some("commit") {
        if let Some(id) = app
            .proposal
            .lock()
            .unwrap()
            .as_ref()
            .map(|p| p.tx.transaction_id.clone())
        {
            return commit_inner(&app, &id, "operator");
        }
        return Json(
            json!({ "reply": "No proposal to commit.", "views": parsed.views, "notes": parsed.notes }),
        );
    }
    if parsed.action.as_deref() == Some("reject") {
        if let Some(id) = app
            .proposal
            .lock()
            .unwrap()
            .as_ref()
            .map(|p| p.tx.transaction_id.clone())
        {
            return reject_inner(&app, &id);
        }
    }

    let reply = if parsed.views.is_empty() && parsed.notes.iter().any(|n| n.contains("No local")) {
        let sys = "You are an ARCHEON engineering copilot. Do not claim FEA, collision-free, or prices. Do not mutate design state. Suggest DTP operations only.";
        provider::complete(
            sys,
            &[archeon_agents::provider::ChatMessage {
                role: "user".into(),
                content: body.message.clone(),
            }],
        )
        .await
        .unwrap_or_else(|e| format!("provider error: {e}"))
    } else {
        parsed.notes.join("\n")
    };

    Json(json!({
        "reply": reply,
        "views": parsed.views,
        "notes": parsed.notes,
        "card": parsed.card,
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

async fn propose(
    State(st): State<AppState>,
    Json(body): Json<ProposeIn>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let mut tx =
        DesignTransaction::propose(&body.agent_id, &body.intent, &body.reason, body.operations);
    authorize_tx(&body.agent_id, &tx).map_err(tx_error_response)?;
    let doc = st.0.doc.lock().unwrap().clone();
    let (preview, diff) = dry_run_with_diff(&doc, &tx).map_err(tx_error_response)?;
    tx.geometry_hash_before = Some(doc.design_hash());
    tx.geometry_hash_after = Some(preview.design_hash());
    tx.diff = Some(diff);
    let report = validate(&preview);
    tx.validation_results = vec![serde_json::to_value(&report).unwrap_or(json!({}))];
    let _ = tx.transition(TxStatus::Validating);
    let _ = tx.transition(if report.ok() {
        TxStatus::Valid
    } else {
        TxStatus::Invalid
    });
    log_line(&st.0, "transaction.propose", &tx.transaction_id);
    st.0.ledger.lock().unwrap().push(tx.clone());
    *st.0.proposal.lock().unwrap() = Some(ProposalState {
        tx: tx.clone(),
        preview,
    });
    let cad_job = tx
        .diff
        .as_ref()
        .is_some_and(|diff| !diff.geometry_affected.is_empty())
        .then(|| live::spawn_cad_job(st.clone(), Some(tx.transaction_id.clone())));
    Ok(Json(json!({ "transaction": tx, "cad_job": cad_job })))
}

fn tx_error_response(error: TxError) -> (StatusCode, Json<Value>) {
    let status = match error {
        TxError::Unauthorized { .. } | TxError::CommitRequired => StatusCode::FORBIDDEN,
        TxError::UnsupportedOperation { .. } => StatusCode::UNPROCESSABLE_ENTITY,
        TxError::Illegal { .. } | TxError::Apply(_) => StatusCode::BAD_REQUEST,
    };
    (
        status,
        Json(json!({ "error": { "code": error.code(), "message": error.to_string() } })),
    )
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
    log_line(
        app,
        "validation",
        "graph validators (not FEA, not exact collision)",
    );
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
    let canonical = app.doc.lock().unwrap().clone();
    let mut next_doc = canonical;
    if let Err(e) = apply_operations(&mut next_doc, &p.tx.operations) {
        return Json(json!({"error": e.to_string()}));
    }
    let rev = next_revision(&next_doc.project.revision_id);
    let parent = next_doc.project.revision_id.clone();
    let tx_id = p.tx.transaction_id.clone();
    let agent_name = p.tx.agent_id.clone();
    let message = p.tx.intent.clone();
    let geom = p.tx.geometry_hash_after.clone();
    next_doc.project.revision_id = rev.clone();
    let hash = next_doc.design_hash();
    next_doc.revisions.push(Revision {
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
    let project_dir = app.project_dir.lock().unwrap().clone();
    if let Err(error) = save_project_dir(&next_doc, &project_dir) {
        return Json(json!({"error": {"code": "PERSIST_FAILED", "message": error.to_string()}}));
    }
    let _ = p.tx.transition(TxStatus::Approved);
    let _ = p.tx.transition(TxStatus::Committed);
    p.tx.user_decision = UserDecision::Approve;
    *app.doc.lock().unwrap() = next_doc;
    log_line(
        app,
        "transaction.commit",
        &format!("{id} -> {rev} hash={hash}"),
    );
    let tx = p.tx.clone();
    if let Some(slot) = app.ledger.lock().unwrap().get_mut(id) {
        *slot = tx.clone();
    }
    *proposal = None;
    if let Some(s) = app.live.session.lock().unwrap().as_mut() {
        s.approve();
    }
    live::emit_kind(
        app,
        "REVISION_COMMITTED",
        json!({ "revision": rev, "hash": hash }),
    );
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
            if let Some(s) = app.live.session.lock().unwrap().as_mut() {
                s.reject();
            }
            live::emit_kind(app, "PROPOSAL_UPDATED", json!({ "status": "REJECTED" }));
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
    log_line(&st.0, "cad.regen", "async job");
    let job = live::spawn_cad_job(st, None);
    Json(json!({
        "ok": true,
        "queued": true,
        "job": job,
        "note": "CAD regeneration is asynchronous. Viewport stays interactive. Geometry hot-swaps when COMPLETE."
    }))
}

async fn list_projects(State(st): State<AppState>) -> Json<Value> {
    let current = st.0.project_dir.lock().unwrap().clone();
    Json(json!({
        "projects": projects::list_projects(&st.0.root),
        "current": current.file_name().and_then(|s| s.to_str())
    }))
}

#[derive(Deserialize)]
struct LoadProjectIn {
    id: String,
}

async fn load_project(
    State(st): State<AppState>,
    Json(body): Json<LoadProjectIn>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let dir = projects::resolve_project_dir(&st.0.root, &body.id).ok_or((
        StatusCode::NOT_FOUND,
        format!("unknown project {}", body.id),
    ))?;
    let mut doc = load_project_dir(&dir).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    projects::attach_cad_files(&mut doc, &dir);
    log_line(&st.0, "project.load", dir.display().to_string().as_str());
    *st.0.doc.lock().unwrap() = doc;
    *st.0.project_dir.lock().unwrap() = dir.clone();
    *st.0.proposal.lock().unwrap() = None;
    *st.0.ledger.lock().unwrap() = Default::default();
    *st.0.live.session.lock().unwrap() = None;
    *st.0.live.variants.lock().unwrap() = vec![];
    Ok(Json(json!({
        "ok": true,
        "folder": dir.file_name().and_then(|s| s.to_str()),
        "hash": st.0.doc.lock().unwrap().design_hash()
    })))
}

async fn media(State(st): State<AppState>, Path(rest): Path<String>) -> impl IntoResponse {
    if !projects::media_is_allowed(&rest) {
        return (StatusCode::FORBIDDEN, "path not allowed").into_response();
    }
    let dir = st.0.project_dir.lock().unwrap().clone();
    let full = dir.join(rest.replace('/', std::path::MAIN_SEPARATOR_STR));
    match std::fs::read(&full) {
        Ok(bytes) => {
            let mime = match full
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_ascii_lowercase()
                .as_str()
            {
                "stl" => "model/stl",
                "step" | "stp" => "model/step",
                "glb" => "model/gltf-binary",
                "gltf" => "model/gltf+json",
                "obj" => "text/plain",
                _ => "application/octet-stream",
            };
            ([(header::CONTENT_TYPE, mime)], bytes).into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "missing CAD media").into_response(),
    }
}

async fn cad_import(
    State(st): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, String)> {
    let mut filename = String::from("import.bin");
    let mut bytes: Vec<u8> = Vec::new();
    let mut attach_to: Option<String> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "part_id" {
            attach_to = field
                .text()
                .await
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            continue;
        }
        if name == "file" || name == "cad" || name.is_empty() {
            if let Some(f) = field.file_name().map(|s| s.to_string()) {
                filename = f;
            }
            bytes = field
                .bytes()
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                .to_vec();
        }
    }
    if bytes.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "no CAD file in upload".into()));
    }
    if bytes.len() > 80 * 1024 * 1024 {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            "CAD file exceeds 80 MiB".into(),
        ));
    }
    let ext = projects::ext_of(&filename);
    if !matches!(
        ext.as_str(),
        "stl" | "step" | "stp" | "glb" | "gltf" | "obj"
    ) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("unsupported CAD format .{ext} — use stl, step, glb, gltf, or obj"),
        ));
    }
    let dir = st.0.project_dir.lock().unwrap().clone();
    let cad_dir = dir.join("cad");
    std::fs::create_dir_all(&cad_dir)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let safe = projects::safe_filename(&filename);
    let rel = format!("cad/{safe}");
    let dest = dir.join(&rel);
    std::fs::write(&dest, &bytes)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let bbox = if ext == "stl" {
        projects::stl_bbox(&bytes)
    } else {
        None
    };
    let preview = if ext == "stl" {
        Some(rel.clone())
    } else {
        None
    };
    let format = if ext == "stp" { "step" } else { ext.as_str() };
    let mut doc = st.0.doc.lock().unwrap();
    let part_id = if let Some(existing) = attach_to {
        if let Some(part) = doc.part_mut(&existing) {
            part.spatial.cad = Some(archeon_design_ir::CadRef::attached(
                format,
                rel.clone(),
                preview.clone(),
                "SOURCE",
                "Imported CAD attached to existing semantic part. Declared CAD_LOCAL Z-UP; not silently rotated.",
                "SOURCE",
            ));
            if let Some([sx, sy, sz]) = bbox {
                if let archeon_design_ir::Primitive::Box {
                    sx: psx,
                    sy: psy,
                    sz: psz,
                } = &mut part.spatial.primitive
                {
                    *psx = sx;
                    *psy = sy;
                    *psz = sz;
                }
            }
            existing
        } else {
            projects::create_imported_part(&mut doc, &safe, &rel, format, bbox, preview)
        }
    } else {
        projects::create_imported_part(&mut doc, &safe, &rel, format, bbox, preview)
    };
    let geometry_class = doc
        .part(&part_id)
        .and_then(|part| part.spatial.cad.as_ref())
        .map(|cad| cad.geometry_class);
    save_project_dir(&doc, &dir)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    log_line(&st.0, "cad.import", &format!("{rel} -> {part_id}"));
    Ok(Json(json!({
        "ok": true,
        "part_id": part_id,
        "path": rel,
        "format": format,
        "geometry_class": geometry_class,
        "bbox_m": bbox,
        "note": if format == "step" {
            "STEP stored as exact CAD. Spatial view uses envelope until a tessellation exists."
        } else {
            "Mesh imported for spatial view. Not a BREP kernel solid."
        }
    })))
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
