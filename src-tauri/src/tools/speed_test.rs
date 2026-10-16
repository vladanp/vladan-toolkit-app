//! Backend for the "Speed Test" tool (`src/tools/speed-test`).
//!
//! Measures the internet connection against Cloudflare's public speed test service, the one
//! behind speed.cloudflare.com: `GET /__down?bytes=N` sends N bytes, `POST /__up` accepts a
//! body, `GET /meta` describes the visitor's connection and `GET /locations` names the
//! servers.
//!
//! The method follows common practice (and Cloudflare's own test):
//! * **Latency**: the median of small requests on a warm connection, minus the time the
//!   server says it spent on them. **Jitter** is the mean change between consecutive samples.
//! * **Download and upload**: several connections in parallel for a fixed time. The speed is
//!   the data moved after a ramp up (TCP slow start) divided by the time it took.
//! * **Latency under load**: latency measured while the transfers run. A big jump means the
//!   router queues too much ("bufferbloat"): games lag whenever someone else streams.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::header::{CONTENT_LENGTH, CONTENT_TYPE, HeaderMap};
use serde::Serialize;
use serde_json::Value;
use specta::Type;
use tauri::State;
use tauri::ipc::Channel;
use tokio::task::JoinSet;

/// Cloudflare's speed test service.
pub const SERVER: &str = "https://speed.cloudflare.com";

/// The error message of a test the user stopped.
pub const CANCELLED: &str = "Cancelled";

/// How a test runs. [`Plan::default`] is the real test; tests use tiny, fast plans.
#[derive(Debug, Clone)]
pub struct Plan {
    pub base_url: String,
    pub latency_samples: usize,
    /// Length of the download and of the upload.
    pub duration: Duration,
    /// Data moved before this is left out of the result (TCP slow start).
    pub ramp_up: Duration,
    pub download_streams: usize,
    pub upload_streams: usize,
    pub download_request_bytes: u64,
    pub upload_request_bytes: u64,
    /// How often live readings are sent.
    pub tick: Duration,
    /// Pause between latency checks while a transfer runs.
    pub loaded_ping_interval: Duration,
}

impl Default for Plan {
    fn default() -> Self {
        Self {
            base_url: SERVER.into(),
            latency_samples: 20,
            duration: Duration::from_secs(10),
            ramp_up: Duration::from_secs(2),
            download_streams: 6,
            upload_streams: 4,
            download_request_bytes: 50_000_000,
            upload_request_bytes: 16_000_000,
            tick: Duration::from_millis(150),
            loaded_ping_interval: Duration::from_millis(400),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Latency,
    Download,
    Upload,
}

/// Where the test runs. Every field is best effort.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    /// The Cloudflare data center, e.g. `"Frankfurt (FRA)"`.
    pub server: Option<String>,
    /// The internet provider, e.g. `"Deutsche Telekom AG"`.
    pub isp: Option<String>,
    /// The public IP address the server saw.
    pub ip: Option<String>,
    /// Where the provider places this connection, e.g. `"Belgrade, RS"`.
    pub location: Option<String>,
}

/// What the frontend hears while a test runs.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SpeedTestEvent {
    Connection {
        connection: ConnectionInfo,
    },
    Phase {
        phase: Phase,
    },
    /// A live reading: milliseconds while measuring latency, megabits per second during
    /// transfers. `fraction` is how far the phase is, 0 to 1.
    Progress {
        phase: Phase,
        value: f64,
        fraction: f64,
    },
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestResult {
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub latency_ms: f64,
    pub jitter_ms: f64,
    /// Latency while downloading, `None` if no check finished in time.
    pub download_latency_ms: Option<f64>,
    /// Latency while uploading, `None` if no check finished in time.
    pub upload_latency_ms: Option<f64>,
    pub data_used_bytes: f64,
    pub connection: ConnectionInfo,
}

/// One test at a time, and a way to stop it.
#[derive(Debug, Default)]
pub struct SpeedTestState {
    running: AtomicBool,
    cancel: Arc<AtomicBool>,
}

/// Clears the running flag however the test ends.
struct RunningGuard<'a>(&'a AtomicBool);

impl Drop for RunningGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn median(samples: &[f64]) -> Option<f64> {
    let mut sorted = samples.to_vec();
    sorted.sort_by(f64::total_cmp);
    let middle = sorted.len() / 2;
    match sorted.len() {
        0 => None,
        len if len % 2 == 0 => Some(f64::midpoint(sorted[middle - 1], sorted[middle])),
        _ => Some(sorted[middle]),
    }
}

/// Mean absolute difference between consecutive samples.
#[allow(clippy::cast_precision_loss)] // A handful of samples.
fn jitter(samples: &[f64]) -> f64 {
    if samples.len() < 2 {
        return 0.0;
    }
    let total: f64 = samples
        .windows(2)
        .map(|pair| (pair[1] - pair[0]).abs())
        .sum();
    total / (samples.len() - 1) as f64
}

/// Server processing time in ms from `Server-Timing: cfRequestDuration;dur=12.3`.
fn server_time_ms(headers: &HeaderMap) -> Option<f64> {
    let value = headers.get("server-timing")?.to_str().ok()?;
    value
        .split(',')
        .find(|metric| metric.trim_start().starts_with("cfRequestDuration"))?
        .split(';')
        .find_map(|param| param.trim().strip_prefix("dur="))?
        .parse()
        .ok()
}

/// Megabits per second between two `(elapsed, bytes)` readings.
#[allow(clippy::cast_precision_loss)] // Byte counts above 2^53 are not a practical concern.
fn rate_mbps(from: (Duration, u64), to: (Duration, u64)) -> f64 {
    let seconds = to.0.saturating_sub(from.0).as_secs_f64();
    if seconds <= 0.0 {
        return 0.0;
    }
    to.1.saturating_sub(from.1) as f64 * 8.0 / seconds / 1_000_000.0
}

/// Speed over the last `window` of readings: the live number.
fn recent_rate(series: &[(Duration, u64)], window: Duration) -> f64 {
    let Some(&last) = series.last() else {
        return 0.0;
    };
    let start = last.0.saturating_sub(window);
    let from = series
        .iter()
        .rev()
        .find(|reading| reading.0 <= start)
        .or(series.first())
        .copied()
        .unwrap_or(last);
    rate_mbps(from, last)
}

/// Speed after the ramp up: the result. Short tests fall back to the whole run.
fn steady_rate(series: &[(Duration, u64)], ramp_up: Duration) -> f64 {
    let Some(&last) = series.last() else {
        return 0.0;
    };
    let from = series
        .iter()
        .find(|reading| reading.0 >= ramp_up && reading.0 < last.0)
        .or(series.first())
        .copied()
        .unwrap_or(last);
    rate_mbps(from, last)
}

/// What a test ends with when the server keeps answering "too many requests".
const BUSY: &str = "The speed test server is busy. Try again in a minute.";

/// How long a transfer connection waits after "too many requests" before trying again.
const BUSY_BACKOFF: Duration = Duration::from_millis(500);

fn is_busy(error: &reqwest::Error) -> bool {
    error.status() == Some(reqwest::StatusCode::TOO_MANY_REQUESTS)
}

/// Words for a failed request that a person can act on.
fn describe(error: &reqwest::Error) -> String {
    if let Some(status) = error.status() {
        return if is_busy(error) {
            BUSY.into()
        } else {
            format!(
                "The speed test server answered with an error (HTTP {}).",
                status.as_u16()
            )
        };
    }
    if error.is_connect() {
        "Couldn't reach the speed test server. Check your internet connection.".into()
    } else if error.is_timeout() {
        "The speed test server stopped responding.".into()
    } else {
        format!("The connection failed: {error}")
    }
}

fn http_client() -> Result<reqwest::Client, String> {
    // reqwest comes without a bundled crypto provider (the updater shares it); use ring.
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        // HTTP/1.1 gives every parallel request its own TCP connection, like any speed test.
        .http1_only()
        .connect_timeout(Duration::from_secs(10))
        .read_timeout(Duration::from_secs(15))
        .user_agent(concat!("VladanToolkit/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("Couldn't start the speed test: {error}"))
}

fn check_cancel(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        Err(CANCELLED.into())
    } else {
        Ok(())
    }
}

async fn fetch_json(client: &reqwest::Client, url: String) -> Option<Value> {
    let response = client
        .get(url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    response.json().await.ok()
}

/// A non-blank string field.
fn field(value: Option<&Value>, key: &str) -> Option<String> {
    value?
        .get(key)?
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

/// Connection details from `/meta` and `/locations`, read leniently: every field may be
/// missing, and the data center (`colo`) may be a code or an object with `iata` and `city`.
fn describe_connection(meta: Option<&Value>, locations: Option<&Value>) -> ConnectionInfo {
    let colo = meta.and_then(|meta| meta.get("colo"));
    let code = colo
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| field(colo, "iata"))
        .map(|code| code.trim().to_owned())
        .filter(|code| !code.is_empty());
    let city = field(colo, "city").or_else(|| {
        let code = code.as_deref()?;
        locations?
            .as_array()?
            .iter()
            .find(|location| {
                location
                    .get("iata")
                    .and_then(Value::as_str)
                    .is_some_and(|iata| iata.eq_ignore_ascii_case(code))
            })
            .and_then(|location| field(Some(location), "city"))
    });
    let location = [field(meta, "city"), field(meta, "country")]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(", ");
    ConnectionInfo {
        server: match (city, code) {
            (Some(city), Some(code)) => Some(format!("{city} ({code})")),
            (None, code) => code,
            (Some(city), None) => Some(city),
        },
        isp: field(meta, "asOrganization"),
        ip: field(meta, "clientIp"),
        location: Some(location).filter(|location| !location.is_empty()),
    }
}

/// What `/cdn-cgi/trace` reports, from `key=value` lines like `ip=…`, `colo=FRA`, `loc=RS`.
#[derive(Debug, Default, PartialEq, Eq)]
struct Trace {
    ip: Option<String>,
    colo: Option<String>,
    country: Option<String>,
}

fn parse_trace(text: &str) -> Trace {
    let mut trace = Trace::default();
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = Some(value.trim().to_owned()).filter(|value| !value.is_empty());
        match key.trim() {
            "ip" => trace.ip = value,
            "colo" => trace.colo = value,
            "loc" => trace.country = value,
            _ => {}
        }
    }
    trace
}

/// Fills in what `/meta` didn't say from `/cdn-cgi/trace`.
fn with_trace(mut info: ConnectionInfo, trace: Trace) -> ConnectionInfo {
    info.ip = info.ip.or(trace.ip);
    info.server = info.server.or(trace.colo);
    info.location = info.location.or(trace.country);
    info
}

async fn fetch_text(client: &reqwest::Client, url: String) -> Option<String> {
    let response = client
        .get(url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    response.text().await.ok()
}

/// `/meta` names the provider and city but may refuse non-browser clients; the public
/// `/cdn-cgi/trace` always gives the IP address, data center and country.
async fn connection_info(client: &reqwest::Client, base: &str) -> ConnectionInfo {
    let (meta, locations, trace) = tokio::join!(
        fetch_json(client, format!("{base}/meta")),
        fetch_json(client, format!("{base}/locations")),
        fetch_text(client, format!("{base}/cdn-cgi/trace")),
    );
    let trace = trace.as_deref().map(parse_trace).unwrap_or_default();
    with_trace(
        describe_connection(meta.as_ref(), locations.as_ref()),
        trace,
    )
}

/// Round trip of an empty request in ms, minus the server's own processing time.
async fn ping(client: &reqwest::Client, base: &str) -> Result<f64, reqwest::Error> {
    let started = Instant::now();
    let response = client
        .get(format!("{base}/__down?bytes=0"))
        .timeout(Duration::from_secs(5))
        .send()
        .await?
        .error_for_status()?;
    let elapsed = started.elapsed().as_secs_f64() * 1000.0;
    let server = server_time_ms(response.headers()).unwrap_or(0.0);
    response.bytes().await?;
    Ok((elapsed - server).max(0.0))
}

#[allow(clippy::cast_precision_loss)] // A handful of samples.
async fn measure_latency<E: Fn(SpeedTestEvent) + Sync>(
    client: &reqwest::Client,
    plan: &Plan,
    cancel: &AtomicBool,
    emit: &E,
) -> Result<Vec<f64>, String> {
    // The first request opens the connection; its handshake isn't latency.
    ping(client, &plan.base_url)
        .await
        .map_err(|e| describe(&e))?;
    let mut samples = Vec::with_capacity(plan.latency_samples);
    for index in 0..plan.latency_samples {
        check_cancel(cancel)?;
        samples.push(
            ping(client, &plan.base_url)
                .await
                .map_err(|e| describe(&e))?,
        );
        emit(SpeedTestEvent::Progress {
            phase: Phase::Latency,
            value: median(&samples).unwrap_or(0.0),
            fraction: (index + 1) as f64 / plan.latency_samples as f64,
        });
    }
    Ok(samples)
}

/// Pings now and then until `deadline`, starting after the ramp up.
async fn loaded_pings(
    client: reqwest::Client,
    base: String,
    start_after: Duration,
    interval: Duration,
    deadline: Instant,
) -> Vec<f64> {
    let mut samples = Vec::new();
    tokio::time::sleep(start_after).await;
    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        if let Ok(Ok(sample)) = tokio::time::timeout(left, ping(&client, &base)).await {
            samples.push(sample);
        }
        tokio::time::sleep(interval).await;
    }
    samples
}

/// What every transfer worker shares.
#[derive(Clone)]
struct Lane {
    client: reqwest::Client,
    url: String,
    request_bytes: u64,
    moved: Arc<AtomicU64>,
    deadline: Instant,
    cancel: Arc<AtomicBool>,
    /// Set when the server said "too many requests" at least once.
    busy: Arc<AtomicBool>,
}

impl Lane {
    fn open(&self) -> bool {
        Instant::now() < self.deadline && !self.cancel.load(Ordering::Relaxed)
    }

    /// Sends a request; on "too many requests" waits a moment and returns `None` so the
    /// worker tries again (Cloudflare limits bursts from one address).
    async fn send(
        &self,
        request: reqwest::RequestBuilder,
    ) -> Result<Option<reqwest::Response>, String> {
        match request
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
        {
            Ok(response) => Ok(Some(response)),
            Err(error) if is_busy(&error) => {
                self.busy.store(true, Ordering::Relaxed);
                let left = self.deadline.saturating_duration_since(Instant::now());
                tokio::time::sleep(BUSY_BACKOFF.min(left)).await;
                Ok(None)
            }
            Err(error) => Err(describe(&error)),
        }
    }
}

async fn download_worker(lane: Lane) -> Result<(), String> {
    while lane.open() {
        let Some(response) = lane.send(lane.client.get(&lane.url)).await? else {
            continue;
        };
        let mut body = response.bytes_stream();
        while let Some(chunk) = body.next().await {
            let chunk = chunk.map_err(|e| describe(&e))?;
            lane.moved.fetch_add(chunk.len() as u64, Ordering::Relaxed);
            if !lane.open() {
                return Ok(());
            }
        }
    }
    Ok(())
}

/// 64 KiB of zeros, sent over and over.
static BLOCK: [u8; 64 * 1024] = [0; 64 * 1024];

/// A body of `total` zero bytes that counts what it hands to the connection. The socket
/// only asks for more once it has sent the previous block, so the count tracks the wire.
fn counted_body(
    total: u64,
    moved: Arc<AtomicU64>,
) -> impl futures_util::Stream<Item = Result<Bytes, std::io::Error>> + Send + 'static {
    futures_util::stream::unfold(0_u64, move |sent| {
        let moved = Arc::clone(&moved);
        async move {
            let size = total.saturating_sub(sent).min(BLOCK.len() as u64);
            if size == 0 {
                return None;
            }
            moved.fetch_add(size, Ordering::Relaxed);
            #[allow(clippy::cast_possible_truncation)] // At most 64 KiB.
            let block = Bytes::from_static(&BLOCK[..size as usize]);
            Some((Ok(block), sent + size))
        }
    })
}

async fn upload_worker(lane: Lane) -> Result<(), String> {
    while lane.open() {
        let request = lane
            .client
            .post(&lane.url)
            .header(CONTENT_TYPE, "application/octet-stream")
            .header(CONTENT_LENGTH, lane.request_bytes)
            .body(reqwest::Body::wrap_stream(counted_body(
                lane.request_bytes,
                Arc::clone(&lane.moved),
            )));
        lane.send(request).await?;
    }
    Ok(())
}

struct Transfer {
    mbps: f64,
    bytes: u64,
    loaded_latency_ms: Option<f64>,
}

/// Runs one download or upload phase and reports the live speed as it goes.
#[allow(clippy::cast_precision_loss)] // Durations are seconds long.
async fn transfer<E: Fn(SpeedTestEvent) + Sync>(
    phase: Phase,
    clients: (&reqwest::Client, &reqwest::Client),
    plan: &Plan,
    cancel: &Arc<AtomicBool>,
    emit: &E,
) -> Result<Transfer, String> {
    let (client, ping_client) = clients;
    let started = Instant::now();
    let deadline = started + plan.duration;
    let (url, request_bytes, streams) = match phase {
        Phase::Upload => (
            format!("{}/__up", plan.base_url),
            plan.upload_request_bytes,
            plan.upload_streams,
        ),
        _ => (
            format!(
                "{}/__down?bytes={}",
                plan.base_url, plan.download_request_bytes
            ),
            plan.download_request_bytes,
            plan.download_streams,
        ),
    };
    let lane = Lane {
        client: client.clone(),
        url,
        request_bytes,
        moved: Arc::new(AtomicU64::new(0)),
        deadline,
        cancel: Arc::clone(cancel),
        busy: Arc::new(AtomicBool::new(false)),
    };

    let mut workers = JoinSet::new();
    for _ in 0..streams.max(1) {
        let lane = lane.clone();
        match phase {
            Phase::Upload => workers.spawn(upload_worker(lane)),
            _ => workers.spawn(download_worker(lane)),
        };
    }
    let pings = tokio::spawn(loaded_pings(
        ping_client.clone(),
        plan.base_url.clone(),
        plan.ramp_up,
        plan.loaded_ping_interval,
        deadline,
    ));

    let mut series = vec![(Duration::ZERO, 0_u64)];
    let mut failure: Option<String> = None;
    let stopped_early = loop {
        tokio::time::sleep(plan.tick).await;
        if cancel.load(Ordering::Relaxed) {
            workers.abort_all();
            pings.abort();
            return Err(CANCELLED.into());
        }
        // Collect workers that gave up, keeping the first error.
        while let Some(finished) = workers.try_join_next() {
            if let Ok(Err(error)) = finished {
                failure.get_or_insert(error);
            }
        }
        let elapsed = started.elapsed();
        series.push((elapsed, lane.moved.load(Ordering::Relaxed)));
        emit(SpeedTestEvent::Progress {
            phase,
            value: recent_rate(&series, Duration::from_secs(1)),
            fraction: (elapsed.as_secs_f64() / plan.duration.as_secs_f64()).min(1.0),
        });
        if elapsed >= plan.duration {
            break false;
        }
        if workers.is_empty() {
            break true;
        }
    };
    workers.abort_all();
    if stopped_early {
        pings.abort();
    }
    let loaded = pings.await.unwrap_or_default();

    let bytes = lane.moved.load(Ordering::Relaxed);
    // Every connection gave up before the time was up: the server refused the transfer.
    if stopped_early || bytes == 0 {
        let busy = lane.busy.load(Ordering::Relaxed);
        return Err(
            failure.unwrap_or_else(|| if busy { BUSY } else { "No data got through." }.into())
        );
    }
    Ok(Transfer {
        mbps: steady_rate(&series, plan.ramp_up),
        bytes,
        loaded_latency_ms: median(&loaded),
    })
}

/// Runs a whole test: connection details, latency, download, upload.
///
/// # Errors
/// [`CANCELLED`] when `cancel` is set, otherwise a message a person can act on.
#[allow(clippy::cast_precision_loss)] // Byte counts above 2^53 are not a practical concern.
pub async fn run<E: Fn(SpeedTestEvent) + Sync>(
    plan: &Plan,
    cancel: &Arc<AtomicBool>,
    emit: &E,
) -> Result<SpeedTestResult, String> {
    let client = http_client()?;
    let ping_client = http_client()?;

    emit(SpeedTestEvent::Phase {
        phase: Phase::Latency,
    });
    let lookup = async {
        let connection = connection_info(&client, &plan.base_url).await;
        emit(SpeedTestEvent::Connection {
            connection: connection.clone(),
        });
        connection
    };
    let (connection, latency) =
        tokio::join!(lookup, measure_latency(&ping_client, plan, cancel, emit));
    let latency = latency?;

    emit(SpeedTestEvent::Phase {
        phase: Phase::Download,
    });
    let download = transfer(Phase::Download, (&client, &ping_client), plan, cancel, emit).await?;
    emit(SpeedTestEvent::Phase {
        phase: Phase::Upload,
    });
    let upload = transfer(Phase::Upload, (&client, &ping_client), plan, cancel, emit).await?;

    Ok(SpeedTestResult {
        download_mbps: download.mbps,
        upload_mbps: upload.mbps,
        latency_ms: median(&latency).unwrap_or(0.0),
        jitter_ms: jitter(&latency),
        download_latency_ms: download.loaded_latency_ms,
        upload_latency_ms: upload.loaded_latency_ms,
        data_used_bytes: (download.bytes + upload.bytes) as f64,
        connection,
    })
}

/// [`run`], but only one at a time per app.
///
/// # Errors
/// As [`run`], or when a test is already running.
pub async fn run_exclusive<E: Fn(SpeedTestEvent) + Sync>(
    state: &SpeedTestState,
    plan: &Plan,
    emit: &E,
) -> Result<SpeedTestResult, String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("A speed test is already running.".into());
    }
    let _running = RunningGuard(&state.running);
    state.cancel.store(false, Ordering::SeqCst);
    run(plan, &state.cancel, emit).await
}

/// Runs a speed test, streaming live readings to `on_event`.
///
/// # Errors
/// [`CANCELLED`] when stopped, otherwise a message a person can act on.
#[tauri::command]
#[specta::specta]
pub async fn speed_test_run(
    state: State<'_, SpeedTestState>,
    on_event: Channel<SpeedTestEvent>,
) -> Result<SpeedTestResult, String> {
    run_exclusive(&state, &Plan::default(), &|event| {
        let _ = on_event.send(event);
    })
    .await
}

/// Stops the running test, if any. It ends with the [`CANCELLED`] error.
#[tauri::command]
#[specta::specta]
pub fn speed_test_cancel(state: State<'_, SpeedTestState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, PoisonError};
    use tauri::Manager;
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
    use tokio::net::{TcpListener, TcpStream};

    /// How the stand-in server misbehaves.
    #[derive(Debug, Clone, Copy, Default)]
    #[allow(clippy::struct_excessive_bools)] // Independent switches, not a state machine.
    struct Mock {
        busy_downloads: bool,
        /// Answer "too many requests" to this many transfer requests first.
        busy_first_downloads: usize,
        broken_uploads: bool,
        no_meta: bool,
        no_trace: bool,
    }

    const META: &str = r#"{"clientIp":"203.0.113.7","asOrganization":"Example ISP","colo":"FRA","city":"Belgrade","country":"RS","httpProtocol":"HTTP/1.1"}"#;
    const TRACE: &str =
        "fl=1f1\nh=speed.cloudflare.com\nip=198.51.100.9\ncolo=AMS\nloc=NL\nhttp=http/1.1\n";
    const LOCATIONS: &str =
        r#"[{"iata":"AMS","city":"Amsterdam"},{"iata":"FRA","lat":50.1,"city":"Frankfurt"}]"#;

    async fn respond(
        socket: &mut (impl AsyncWriteExt + Unpin),
        status: &str,
        headers: &str,
        body: &[u8],
    ) -> std::io::Result<()> {
        let head = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\n{headers}\r\n",
            body.len()
        );
        socket.write_all(head.as_bytes()).await?;
        socket.write_all(body).await
    }

    /// A tiny HTTP/1.1 server speaking just enough of Cloudflare's speed test API.
    async fn handle(socket: TcpStream, mock: Mock, served: Arc<AtomicU64>) -> std::io::Result<()> {
        let (read, mut write) = socket.into_split();
        let mut reader = BufReader::new(read);
        loop {
            let mut request = String::new();
            if reader.read_line(&mut request).await? == 0 {
                return Ok(());
            }
            let mut length = 0_u64;
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).await? == 0 || line == "\r\n" {
                    break;
                }
                if let Some((name, value)) = line.split_once(':')
                    && name.eq_ignore_ascii_case("content-length")
                {
                    length = value.trim().parse().unwrap_or(0);
                }
            }
            tokio::io::copy(&mut (&mut reader).take(length), &mut tokio::io::sink()).await?;

            let mut parts = request.split_whitespace();
            let (method, path) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
            let json = "Content-Type: application/json\r\n";
            match (method, path) {
                ("GET", "/meta") if !mock.no_meta => {
                    respond(&mut write, "200 OK", json, META.as_bytes()).await?;
                }
                ("GET", "/locations") if !mock.no_meta => {
                    respond(&mut write, "200 OK", json, LOCATIONS.as_bytes()).await?;
                }
                ("GET", "/cdn-cgi/trace") if !mock.no_trace => {
                    respond(&mut write, "200 OK", "", TRACE.as_bytes()).await?;
                }
                ("GET", "/__down?bytes=0") => {
                    let timing = "Server-Timing: cfRequestDuration;dur=0.25\r\n";
                    respond(&mut write, "200 OK", timing, b"").await?;
                }
                ("GET", path) if path.starts_with("/__down?bytes=") => {
                    let index = served.fetch_add(1, Ordering::SeqCst);
                    if mock.busy_downloads || index < mock.busy_first_downloads as u64 {
                        respond(&mut write, "429 Too Many Requests", "", b"").await?;
                        continue;
                    }
                    let bytes: u64 = path["/__down?bytes=".len()..].parse().unwrap_or(0);
                    let head = format!("HTTP/1.1 200 OK\r\nContent-Length: {bytes}\r\n\r\n");
                    write.write_all(head.as_bytes()).await?;
                    let mut left = bytes;
                    while left > 0 {
                        let size = left.min(BLOCK.len() as u64);
                        #[allow(clippy::cast_possible_truncation)] // At most 64 KiB.
                        write.write_all(&BLOCK[..size as usize]).await?;
                        left -= size;
                    }
                }
                ("POST", "/__up") if mock.broken_uploads => {
                    respond(&mut write, "500 Internal Server Error", "", b"").await?;
                }
                ("POST", "/__up") => respond(&mut write, "200 OK", "", b"").await?,
                _ => respond(&mut write, "404 Not Found", "", b"").await?,
            }
        }
    }

    async fn serve(mock: Mock) -> String {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .unwrap_or_else(|e| panic!("bind: {e}"));
        let address = listener
            .local_addr()
            .unwrap_or_else(|e| panic!("address: {e}"));
        let served = Arc::new(AtomicU64::new(0));
        tokio::spawn(async move {
            while let Ok((socket, _)) = listener.accept().await {
                tokio::spawn(handle(socket, mock, Arc::clone(&served)));
            }
        });
        format!("http://{address}")
    }

    fn quick_plan(base_url: String) -> Plan {
        Plan {
            base_url,
            latency_samples: 3,
            duration: Duration::from_millis(400),
            ramp_up: Duration::from_millis(100),
            download_streams: 2,
            upload_streams: 2,
            download_request_bytes: 256 * 1024,
            upload_request_bytes: 256 * 1024,
            tick: Duration::from_millis(50),
            loaded_ping_interval: Duration::from_millis(40),
        }
    }

    async fn run_against(mock: Mock) -> (Result<SpeedTestResult, String>, Vec<SpeedTestEvent>) {
        let plan = quick_plan(serve(mock).await);
        let events = Mutex::new(Vec::new());
        let emit = |event| {
            events
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(event);
        };
        let result = run(&plan, &Arc::new(AtomicBool::new(false)), &emit).await;
        (
            result,
            events.into_inner().unwrap_or_else(PoisonError::into_inner),
        )
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn measures_everything_against_a_local_server() {
        let (result, events) = run_against(Mock::default()).await;
        let result = result.unwrap_or_else(|e| panic!("{e}"));
        assert!(result.download_mbps > 0.0, "{result:?}");
        assert!(result.upload_mbps > 0.0, "{result:?}");
        assert!(result.latency_ms >= 0.0 && result.jitter_ms >= 0.0);
        assert!(result.download_latency_ms.is_some() && result.upload_latency_ms.is_some());
        assert!(result.data_used_bytes > 0.0);
        let expected = ConnectionInfo {
            server: Some("Frankfurt (FRA)".into()),
            isp: Some("Example ISP".into()),
            ip: Some("203.0.113.7".into()),
            location: Some("Belgrade, RS".into()),
        };
        assert_eq!(result.connection, expected);
        assert!(events.contains(&SpeedTestEvent::Connection {
            connection: expected
        }));

        let phases: Vec<Phase> = events
            .iter()
            .filter_map(|event| match event {
                SpeedTestEvent::Phase { phase } => Some(*phase),
                _ => None,
            })
            .collect();
        assert_eq!(phases, [Phase::Latency, Phase::Download, Phase::Upload]);
        for phase in phases {
            let readings: Vec<f64> = events
                .iter()
                .filter_map(|event| match event {
                    SpeedTestEvent::Progress {
                        phase: p, fraction, ..
                    } if *p == phase => Some(*fraction),
                    _ => None,
                })
                .collect();
            assert!(!readings.is_empty(), "{phase:?}");
            assert!(readings.iter().all(|f| (0.0..=1.0).contains(f)));
            assert!((readings[readings.len() - 1] - 1.0).abs() < f64::EPSILON);
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn works_without_connection_details() {
        // `/meta` refused: the trace still names the data center, address and country.
        let (result, _) = run_against(Mock {
            no_meta: true,
            ..Mock::default()
        })
        .await;
        let expected = ConnectionInfo {
            server: Some("AMS".into()),
            isp: None,
            ip: Some("198.51.100.9".into()),
            location: Some("NL".into()),
        };
        assert_eq!(
            result.unwrap_or_else(|e| panic!("{e}")).connection,
            expected
        );

        let (result, _) = run_against(Mock {
            no_meta: true,
            no_trace: true,
            ..Mock::default()
        })
        .await;
        let connection = result.unwrap_or_else(|e| panic!("{e}")).connection;
        assert_eq!(connection, ConnectionInfo::default());
    }

    #[test]
    fn reads_the_trace() {
        assert_eq!(
            parse_trace(TRACE),
            Trace {
                ip: Some("198.51.100.9".into()),
                colo: Some("AMS".into()),
                country: Some("NL".into()),
            }
        );
        assert_eq!(parse_trace("garbage\nip=\n"), Trace::default());
        // `/meta` wins where it answered.
        let meta = ConnectionInfo {
            server: Some("Frankfurt (FRA)".into()),
            ..ConnectionInfo::default()
        };
        assert_eq!(
            with_trace(meta, parse_trace(TRACE)),
            ConnectionInfo {
                server: Some("Frankfurt (FRA)".into()),
                isp: None,
                ip: Some("198.51.100.9".into()),
                location: Some("NL".into()),
            }
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn explains_a_busy_server() {
        let (result, _) = run_against(Mock {
            busy_downloads: true,
            ..Mock::default()
        })
        .await;
        assert_eq!(
            result.err().as_deref(),
            Some("The speed test server is busy. Try again in a minute.")
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn rides_out_a_briefly_busy_server() {
        // Long enough for a back off or two (the quick plan's phases are shorter than one).
        let plan = Plan {
            duration: Duration::from_millis(2500),
            ..quick_plan(
                serve(Mock {
                    busy_first_downloads: 3,
                    ..Mock::default()
                })
                .await,
            )
        };
        let result = run(&plan, &Arc::new(AtomicBool::new(false)), &|_| {}).await;
        assert!(result.unwrap_or_else(|e| panic!("{e}")).download_mbps > 0.0);
    }

    #[test]
    fn reads_connection_details_leniently() {
        let json =
            |text: &str| serde_json::from_str::<Value>(text).unwrap_or_else(|e| panic!("{e}"));
        let locations = json(LOCATIONS);
        let expected = ConnectionInfo {
            server: Some("Frankfurt (FRA)".into()),
            isp: Some("Example ISP".into()),
            ip: Some("203.0.113.7".into()),
            location: Some("Belgrade, RS".into()),
        };
        assert_eq!(
            describe_connection(Some(&json(META)), Some(&locations)),
            expected
        );
        // The data center as an object instead of a code.
        let nested = json(
            r#"{"clientIp":"203.0.113.7","asOrganization":"Example ISP","city":"Belgrade","country":"RS","colo":{"iata":"FRA","city":"Frankfurt"}}"#,
        );
        assert_eq!(describe_connection(Some(&nested), None), expected);
        // A code the locations list doesn't know, and blank fields.
        let sparse = json(r#"{"colo":"XYZ","clientIp":" ","country":"RS"}"#);
        assert_eq!(
            describe_connection(Some(&sparse), Some(&locations)),
            ConnectionInfo {
                server: Some("XYZ".into()),
                location: Some("RS".into()),
                ..ConnectionInfo::default()
            }
        );
        let city_only = json(r#"{"colo":{"city":"Paris"}}"#);
        assert_eq!(
            describe_connection(Some(&city_only), None)
                .server
                .as_deref(),
            Some("Paris")
        );
        assert_eq!(describe_connection(None, None), ConnectionInfo::default());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn explains_server_errors() {
        let (result, _) = run_against(Mock {
            broken_uploads: true,
            ..Mock::default()
        })
        .await;
        assert_eq!(
            result.err().as_deref(),
            Some("The speed test server answered with an error (HTTP 500).")
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn explains_an_unreachable_server() {
        // Nothing listens on a port the OS just handed out and took back.
        let address = TcpListener::bind("127.0.0.1:0")
            .await
            .and_then(|listener| listener.local_addr())
            .unwrap_or_else(|e| panic!("{e}"));
        let plan = quick_plan(format!("http://{address}"));
        let result = run(&plan, &Arc::new(AtomicBool::new(false)), &|_| {}).await;
        assert_eq!(
            result.err().as_deref(),
            Some("Couldn't reach the speed test server. Check your internet connection.")
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stops_when_cancelled() {
        let plan = Plan {
            duration: Duration::from_secs(30),
            ..quick_plan(serve(Mock::default()).await)
        };
        let cancel = Arc::new(AtomicBool::new(false));
        let stopper = Arc::clone(&cancel);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(300)).await;
            stopper.store(true, Ordering::SeqCst);
        });
        let started = Instant::now();
        let result = run(&plan, &cancel, &|_| {}).await;
        assert_eq!(result.err().as_deref(), Some(CANCELLED));
        assert!(started.elapsed() < Duration::from_secs(5));

        // Cancelled before the first latency sample.
        let result = run(&plan, &Arc::new(AtomicBool::new(true)), &|_| {}).await;
        assert_eq!(result.err().as_deref(), Some(CANCELLED));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn runs_one_test_at_a_time() {
        let state = SpeedTestState::default();
        let plan = quick_plan(serve(Mock::default()).await);
        state.cancel.store(true, Ordering::SeqCst);
        // A new test clears an old cancel request and the running flag afterwards.
        assert!(run_exclusive(&state, &plan, &|_| {}).await.is_ok());
        assert!(!state.running.load(Ordering::SeqCst));
        state.running.store(true, Ordering::SeqCst);
        assert_eq!(
            run_exclusive(&state, &plan, &|_| {}).await.err().as_deref(),
            Some("A speed test is already running.")
        );
    }

    #[test]
    fn cancel_command_flags_the_running_test() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap_or_else(|e| panic!("failed to build app: {e}"));
        app.manage(SpeedTestState::default());
        speed_test_cancel(app.state());
        assert!(app.state::<SpeedTestState>().cancel.load(Ordering::SeqCst));
    }

    #[test]
    fn statistics() {
        assert_eq!(median(&[]), None);
        assert_eq!(median(&[5.0, 1.0, 3.0]), Some(3.0));
        assert_eq!(median(&[4.0, 1.0, 3.0, 2.0]), Some(2.5));
        assert!(jitter(&[10.0]).abs() < f64::EPSILON);
        assert!((jitter(&[10.0, 14.0, 12.0]) - 3.0).abs() < 1e-9);
    }

    #[test]
    fn reads_server_timing() {
        let mut headers = HeaderMap::new();
        assert_eq!(server_time_ms(&headers), None);
        headers.insert(
            "server-timing",
            "cfL4;desc=\"x\", cfRequestDuration;dur=12.5"
                .parse()
                .unwrap_or_else(|e| panic!("{e}")),
        );
        assert_eq!(server_time_ms(&headers), Some(12.5));
        headers.insert(
            "server-timing",
            "other;dur=3".parse().unwrap_or_else(|e| panic!("{e}")),
        );
        assert_eq!(server_time_ms(&headers), None);
    }

    #[test]
    fn computes_rates() {
        let s = Duration::from_secs;
        let ms = Duration::from_millis;
        // 1 MB in one second is 8 Mbps.
        assert!((rate_mbps((s(0), 0), (s(1), 1_000_000)) - 8.0).abs() < 1e-9);
        assert!(rate_mbps((s(1), 0), (s(1), 1_000_000)).abs() < f64::EPSILON);
        let series = [
            (s(0), 0),
            (s(1), 1_000_000),
            (s(2), 3_000_000),
            (s(3), 6_000_000),
        ];
        // Live: only the last second counts.
        assert!((recent_rate(&series, s(1)) - 24.0).abs() < 1e-9);
        // Result: everything after a 1.5 s ramp up, so from 2 s on.
        assert!((steady_rate(&series, ms(1500)) - 24.0).abs() < 1e-9);
        // A test shorter than the ramp up uses the whole run.
        assert!((steady_rate(&series, s(10)) - 16.0).abs() < 1e-9);
        assert!(recent_rate(&[], s(1)).abs() < f64::EPSILON);
        assert!(steady_rate(&[], s(1)).abs() < f64::EPSILON);
    }

    #[test]
    fn default_plan_is_the_real_test() {
        let plan = Plan::default();
        assert_eq!(plan.base_url, SERVER);
        assert!(plan.ramp_up < plan.duration);
    }

    /// Runs a short test against Cloudflare itself. Needs the internet, so it is ignored
    /// by default: `cargo test live_cloudflare -- --ignored --nocapture`.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "needs the internet"]
    async fn live_cloudflare() {
        let plan = Plan {
            latency_samples: 5,
            duration: Duration::from_secs(4),
            ramp_up: Duration::from_secs(1),
            ..Plan::default()
        };
        // Show what the metadata endpoints return, to keep the parser honest.
        let client = http_client().unwrap_or_else(|e| panic!("{e}"));
        if let Ok(response) = client.get(format!("{SERVER}/__down?bytes=0")).send().await {
            for (name, value) in response.headers() {
                if name.as_str().starts_with("cf-") || name.as_str() == "server-timing" {
                    println!("header {name}: {}", value.to_str().unwrap_or("?"));
                }
            }
        }
        for path in ["meta", "locations", "cdn-cgi/trace"] {
            match client.get(format!("{SERVER}/{path}")).send().await {
                Ok(response) => {
                    let status = response.status();
                    let body: String = response
                        .text()
                        .await
                        .unwrap_or_default()
                        .chars()
                        .take(400)
                        .collect();
                    println!("/{path} {status}: {body}");
                }
                Err(error) => println!("/{path} failed: {error}"),
            }
        }
        let result = run(&plan, &Arc::new(AtomicBool::new(false)), &|_| {})
            .await
            .unwrap_or_else(|e| panic!("{e}"));
        println!("{result:#?}");
        assert!(result.download_mbps > 0.0 && result.upload_mbps > 0.0);
    }
}
