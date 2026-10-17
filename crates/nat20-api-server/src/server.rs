//! Request handling: parse a line into a contract `Request`, execute it once, answer with a `Response`.

use std::collections::{HashMap, VecDeque};

use nat20_api_contract::{
    ApiError, Awaiting, CONTRACT_VERSION, Command, CommandResult, ErrorCode, PROTOCOL_MAJOR,
    PROTOCOL_NAME, Request, Response, V1,
};

use crate::adapter;

/// SHA-256 of `generated/nat20-api.schema.json`, written by `npm run gen`.
pub const SCHEMA_SHA256: &str = include_str!("../../../generated/nat20-api.schema.sha256");

/// How many request ids are remembered for idempotent replay (contract/protocol.md §Envelope).
const REMEMBERED_IDS: usize = 256;

/// One engine session's request handler. Holds no rules state yet: every command but `hello`
/// answers `not_implemented` until the server port (CON-3) wires it to the core.
#[derive(Default)]
pub struct Server {
    answered: HashMap<String, String>,
    order: VecDeque<String>,
}

impl Server {
    pub fn new() -> Self {
        Self::default()
    }

    /// Handles one request line and returns one response line (no trailing newline).
    pub fn handle_line(&mut self, line: &str) -> String {
        let value: serde_json::Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(error) => {
                return encode(&failure(
                    None,
                    ErrorCode::BadRequest,
                    format!("The request line is not valid JSON: {error}."),
                ));
            }
        };
        let id = value
            .get("id")
            .and_then(|id| id.as_str())
            .map(str::to_owned);

        if let Some(v) = value.get("v").and_then(|v| v.as_u64())
            && v != u64::from(PROTOCOL_MAJOR)
        {
            return encode(&failure(
                id,
                ErrorCode::UnsupportedVersion,
                format!("This engine speaks protocol version {PROTOCOL_MAJOR}, not {v}."),
            ));
        }

        let request: Request = match serde_json::from_value(value) {
            Ok(request) => request,
            Err(error) => {
                return encode(&failure(
                    id,
                    ErrorCode::BadRequest,
                    format!("The request is malformed: {error}."),
                ));
            }
        };

        if let Some(stored) = self.answered.get(&request.id) {
            return stored.clone();
        }
        let line = encode(&self.execute(&request));
        self.remember(request.id, line.clone());
        line
    }

    fn execute(&mut self, request: &Request) -> Response {
        let result = match request.command {
            Command::Hello => CommandResult::Hello {
                protocol: PROTOCOL_NAME.to_owned(),
                version: CONTRACT_VERSION.to_owned(),
                engine_rev: adapter::engine_rev().to_owned(),
                schema_sha256: SCHEMA_SHA256.trim().to_owned(),
            },
            ref command => {
                let name = serde_json::to_value(command).expect("commands serialize")["cmd"]
                    .as_str()
                    .unwrap_or_default()
                    .to_owned();
                return failure(
                    Some(request.id.clone()),
                    ErrorCode::NotImplemented,
                    format!(
                        "`{name}` is in contract {CONTRACT_VERSION} but this engine does not implement it yet."
                    ),
                );
            }
        };
        Response {
            v: V1::CURRENT,
            id: Some(request.id.clone()),
            ok: true,
            result: Some(result),
            error: None,
            events: Vec::new(),
            awaiting: Awaiting::NoSession,
            log_head: 0,
        }
    }

    fn remember(&mut self, id: String, line: String) {
        if self.order.len() == REMEMBERED_IDS
            && let Some(oldest) = self.order.pop_front()
        {
            self.answered.remove(&oldest);
        }
        self.order.push_back(id.clone());
        self.answered.insert(id, line);
    }
}

fn failure(id: Option<String>, code: ErrorCode, message: String) -> Response {
    // contract/protocol.md §7: these fail again however the caller changes its input or waits.
    let retryable = !matches!(
        code,
        ErrorCode::BadRequest
            | ErrorCode::UnsupportedVersion
            | ErrorCode::NoSession
            | ErrorCode::NoScene
            | ErrorCode::NotVisible
            | ErrorCode::WrongMode
            | ErrorCode::NotImplemented
            | ErrorCode::Internal
    );
    Response {
        v: V1::CURRENT,
        id,
        ok: false,
        result: None,
        error: Some(ApiError {
            code,
            reason: None,
            message,
            retryable,
            hint: None,
        }),
        events: Vec::new(),
        awaiting: Awaiting::NoSession,
        log_head: 0,
    }
}

fn encode(response: &Response) -> String {
    serde_json::to_string(response).expect("contract types always serialize")
}
