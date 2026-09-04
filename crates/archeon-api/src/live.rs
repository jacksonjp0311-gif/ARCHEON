//! Live Design HTTP + CAD jobs + SSE. Events describe state; they never commit DesignIR.
use super::{cad, log_line, projects, App, AppState};
use archeon_design_ir::save_project_dir;
use archeon_live::{
    three_length_variants, CadJob, CadJobStatus, EngineeringEvent, LiveDesignSession, Variant,
};
use axum::{
    extract::{Path, State},
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use futures_util::stream::Stream;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashMap, convert::Infallible, sync::Mutex, time::Duration};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

pub struct LiveRuntime {
    pub session: Mutex<Option<LiveDesignSession>>,
    pub jobs: Mutex<HashMap<String, CadJob>>,
    pub variants: Mutex<Vec<Variant>>,
    pub events: broadcast::Sender<EngineeringEvent>,
    pub geom_rev: Mutex<u32>,
}

impl LiveRuntime {
    pub fn new() -> Self {
        let (events, _) = broadcast::channel(128);
        Self {
            session: Mutex::new(None),
            jobs: Mutex::new(HashMap::new()),
            variants: Mutex::new(vec![]),
            events,
            geom_rev: Mutex::new(0),
        }
    }

    pub fn emit(&self, ev: EngineeringEvent) {
        let _ = self.events.send(ev);
    }
}

pub fn emit_kind(app: &App, kind: &str, payload: Value) {
    app.live.emit(EngineeringEvent::new(kind, payload));
}

pub fn spawn_cad_job(st: AppState, transaction_id: Option<String>) -> CadJob {
    let preview = transaction_id.as_ref().and_then(|id| {
        st.0.proposal.lock().ok().and_then(|proposal| {
            proposal
                .as_ref()
                .filter(|p| &p.tx.transaction_id == id)
                .map(|p| p.preview.clone())
        })
    });
    let job = CadJob::queued(transaction_id.clone());
    st.0.live
        .jobs
        .lock()
        .unwrap()
        .insert(job.id.clone(), job.clone());
    emit_kind(
        &st.0,
        "CAD_JOB_STARTED",
        json!({ "id": job.id, "transaction_id": transaction_id }),
    );
    log_line(&st.0, "cad.job", &format!("queued {}", job.id));
    let job_id = job.id.clone();
    tokio::spawn(async move {
        {
            if let Some(j) = st.0.live.jobs.lock().unwrap().get_mut(&job_id) {
                j.run();
            }
            if let Some(s) = st.0.live.session.lock().unwrap().as_mut() {
                s.mark_regen("RUNNING");
            }
        }
        emit_kind(
            &st.0,
            "CAD_JOB_STARTED",
            json!({ "id": job_id, "status": "RUNNING" }),
        );
        let dir = st.0.project_dir.lock().unwrap().clone();
        let regen_dir =
            if let (Some(tx), Some(preview)) = (transaction_id.as_ref(), preview.as_ref()) {
                let preview_dir = dir
                    .join(".preview")
                    .join(tx.replace(|c: char| !c.is_ascii_alphanumeric() && c != '.', "_"));
                if let Err(error) = std::fs::create_dir_all(&preview_dir)
                    .and_then(|_| save_project_dir(preview, &preview_dir))
                {
                    if let Some(j) = st.0.live.jobs.lock().unwrap().get_mut(&job_id) {
                        j.fail(error.to_string());
                    }
                    emit_kind(
                        &st.0,
                        "CAD_JOB_FAILED",
                        json!({ "id": job_id, "error": error.to_string() }),
                    );
                    return;
                }
                preview_dir
            } else {
                dir.clone()
            };
        let result = cad::regenerate(&st.0.root, &regen_dir).await;
        match result {
            Ok(v) => {
                if transaction_id.is_none() {
                    if let Ok(mut doc) = st.0.doc.lock() {
                        projects::attach_cad_files(&mut doc, &dir);
                    }
                }
                *st.0.live.geom_rev.lock().unwrap() += 1;
                if let Some(j) = st.0.live.jobs.lock().unwrap().get_mut(&job_id) {
                    j.complete(v.clone());
                }
                if let Some(s) = st.0.live.session.lock().unwrap().as_mut() {
                    s.mark_regen("COMPLETE");
                }
                emit_kind(
                    &st.0,
                    "CAD_JOB_COMPLETE",
                    json!({ "id": job_id, "result": v }),
                );
                log_line(&st.0, "cad.job", &format!("complete {job_id}"));
            }
            Err(e) => {
                if let Some(j) = st.0.live.jobs.lock().unwrap().get_mut(&job_id) {
                    j.fail(e.clone());
                }
                if let Some(s) = st.0.live.session.lock().unwrap().as_mut() {
                    s.mark_regen("FAILED");
                }
                emit_kind(&st.0, "CAD_JOB_FAILED", json!({ "id": job_id, "error": e }));
                log_line(&st.0, "cad.job", &format!("failed {job_id}: {e}"));
            }
        }
    });
    job
}

pub async fn session_get(State(st): State<AppState>) -> Json<Value> {
    Json(json!({
        "session": st.0.live.session.lock().unwrap().clone(),
        "geom_rev": *st.0.live.geom_rev.lock().unwrap()
    }))
}

pub async fn session_get_id(State(st): State<AppState>, Path(id): Path<String>) -> Json<Value> {
    let g = st.0.live.session.lock().unwrap();
    match g.as_ref() {
        Some(s) if s.session_id == id => Json(json!(s)),
        _ => Json(json!({ "error": "no such session" })),
    }
}

#[derive(Deserialize)]
pub struct StartIn {
    #[serde(default)]
    pub agent_id: Option<String>,
}

pub async fn session_start(State(st): State<AppState>, Json(body): Json<StartIn>) -> Json<Value> {
    let doc = st.0.doc.lock().unwrap().clone();
    let live = LiveDesignSession::start(body.agent_id.as_deref().unwrap_or("cad-designer"), &doc);
    let id = live.session_id.clone();
    *st.0.live.session.lock().unwrap() = Some(live.clone());
    emit_kind(&st.0, "AGENT_STARTED", json!({ "session_id": id }));
    Json(json!({ "session": live }))
}

pub async fn session_cancel(State(st): State<AppState>) -> Json<Value> {
    let mut g = st.0.live.session.lock().unwrap();
    if let Some(s) = g.as_mut() {
        s.cancel();
        let out = s.clone();
        *g = None;
        drop(g);
        *st.0.proposal.lock().unwrap() = None;
        emit_kind(&st.0, "PROPOSAL_UPDATED", json!({ "status": "CANCELLED" }));
        return Json(json!({ "cancelled": out, "note": "Canonical DesignIR unchanged." }));
    }
    Json(json!({ "error": "no live session" }))
}

pub async fn jobs_list(State(st): State<AppState>) -> Json<Value> {
    let jobs: Vec<_> = st.0.live.jobs.lock().unwrap().values().cloned().collect();
    Json(json!({ "jobs": jobs, "geom_rev": *st.0.live.geom_rev.lock().unwrap() }))
}

pub async fn job_get(State(st): State<AppState>, Path(id): Path<String>) -> Json<Value> {
    Json(json!(st.0.live.jobs.lock().unwrap().get(&id)))
}

pub async fn variants_list(State(st): State<AppState>) -> Json<Value> {
    let vars = st.0.live.variants.lock().unwrap();
    Json(json!({
        "variants": vars.iter().map(|v| json!({
            "id": v.id,
            "label": v.label,
            "status": v.status,
            "metrics": v.metrics,
            "base_revision": v.base_revision,
            "preview_parts": v.preview.parts
        })).collect::<Vec<_>>()
    }))
}

pub async fn variant_get(State(st): State<AppState>, Path(id): Path<String>) -> Json<Value> {
    let vars = st.0.live.variants.lock().unwrap();
    Json(json!(vars.iter().find(|v| v.id.eq_ignore_ascii_case(&id))))
}

#[derive(Deserialize)]
pub struct VariantCreateIn {
    #[serde(default)]
    pub param: Option<String>,
}

pub async fn variants_create(
    State(st): State<AppState>,
    Json(body): Json<VariantCreateIn>,
) -> Json<Value> {
    let doc = st.0.doc.lock().unwrap().clone();
    let param = body.param.unwrap_or_else(|| "upper_arm.length".into());
    match three_length_variants(&doc, &param, [25.0, 50.0, 75.0]) {
        Ok(v) => {
            *st.0.live.variants.lock().unwrap() = v.clone();
            emit_kind(&st.0, "PROPOSAL_UPDATED", json!({ "variants": v.len() }));
            Json(
                json!({ "variants": v.iter().map(|x| json!({"id": x.id, "metrics": x.metrics, "status": x.status})).collect::<Vec<_>>(), "note": "PREVIEW envelopes. Canonical DesignIR unchanged." }),
            )
        }
        Err(e) => Json(json!({ "error": e })),
    }
}

pub async fn events_stream(
    State(st): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = st.0.live.events.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|msg| match msg {
        Ok(ev) => {
            let data = serde_json::to_string(&ev).unwrap_or_else(|_| "{}".into());
            Some(Ok::<Event, Infallible>(
                Event::default().event(ev.kind).data(data),
            ))
        }
        Err(_) => None,
    });
    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(20))
            .text("ping"),
    )
}

pub fn job_snapshot(app: &App) -> Value {
    let jobs: Vec<_> = app.live.jobs.lock().unwrap().values().cloned().collect();
    json!({
        "jobs": jobs,
        "geom_rev": *app.live.geom_rev.lock().unwrap(),
        "session": app.live.session.lock().unwrap().clone(),
        "variant_count": app.live.variants.lock().unwrap().len()
    })
}

#[allow(dead_code)]
pub fn latest_job(app: &App) -> Option<CadJob> {
    app.live
        .jobs
        .lock()
        .unwrap()
        .values()
        .cloned()
        .max_by_key(|j| j.requested_at.clone())
}

#[allow(dead_code)]
pub fn _status_name(s: CadJobStatus) -> &'static str {
    match s {
        CadJobStatus::Queued => "QUEUED",
        CadJobStatus::Running => "RUNNING",
        CadJobStatus::Tessellating => "TESSELLATING",
        CadJobStatus::Complete => "COMPLETE",
        CadJobStatus::Failed => "FAILED",
        CadJobStatus::Cancelled => "CANCELLED",
    }
}
