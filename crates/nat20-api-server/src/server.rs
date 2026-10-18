//! Request handling: parse a line into a contract `Request`, execute it once, answer with a `Response`.

use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
};

use nat20_api_contract::{
    ApiError, Awaiting, CONTRACT_VERSION, Command, CommandResult, ErrorCode, PROTOCOL_MAJOR,
    PROTOCOL_NAME, RejectReason, Request, Response, V1,
};

use crate::{adapter, errors, projection::Viewer, session::Session};

/// SHA-256 over the wire and scene schemas (`generated/nat20-api.schema.json`, then
/// `generated/nat20-scene.schema.json`), written by `npm run gen`.
pub const SCHEMA_SHA256: &str = include_str!("../../../generated/nat20-api.schema.sha256");

/// How many request ids are remembered for idempotent replay (contract/protocol.md §Envelope).
const REMEMBERED_IDS: usize = 256;

/// The engine's request handler: request-id idempotency and at most one session.
pub struct Server {
    data_dir: PathBuf,
    session: Option<Session>,
    sessions_started: u64,
    answered: HashMap<String, String>,
    order: VecDeque<String>,
}

impl Default for Server {
    fn default() -> Self {
        Self::with_data_dir(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("data"))
    }
}

impl Server {
    pub fn new() -> Self {
        Self::default()
    }

    /// A server that reads scenes and stat blocks from `data_dir` (`scenes/`, `monsters/`).
    pub fn with_data_dir(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            session: None,
            sessions_started: 0,
            answered: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    /// Handles one request line and returns one response line (no trailing newline).
    pub fn handle_line(&mut self, line: &str) -> String {
        let value: serde_json::Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(error) => {
                let failure = self.failure(
                    None,
                    errors::error(
                        ErrorCode::BadRequest,
                        format!("The request line is not valid JSON: {error}."),
                    ),
                );
                return encode(&failure);
            }
        };
        let id = value
            .get("id")
            .and_then(|id| id.as_str())
            .map(str::to_owned);

        if let Some(v) = value.get("v").and_then(|v| v.as_u64())
            && v != u64::from(PROTOCOL_MAJOR)
        {
            let failure = self.failure(
                id,
                errors::error(
                    ErrorCode::UnsupportedVersion,
                    format!("This engine speaks protocol version {PROTOCOL_MAJOR}, not {v}."),
                ),
            );
            return encode(&failure);
        }

        let request: Request = match serde_json::from_value(value) {
            Ok(request) => request,
            Err(error) => {
                let failure = self.failure(
                    id,
                    errors::error(
                        ErrorCode::BadRequest,
                        format!("The request is malformed: {error}."),
                    ),
                );
                return encode(&failure);
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
        let viewer = Viewer::parse(&request.viewer.0);
        let session_before = self.sessions_started;
        let head_before = self.session.as_ref().map_or(0, |s| s.log_head());
        let result = self.run(&request.command, &viewer);
        // A new session starts a new log, so all of it is new.
        let since = if self.sessions_started != session_before {
            0
        } else {
            head_before
        };
        // A refused decision can still have logged what the engine did before refusing, so an
        // error response carries the new events too.
        let events = self
            .session
            .as_ref()
            .map(|s| s.events(since, &viewer))
            .unwrap_or_default();
        let (ok, result, error) = match result {
            Ok(result) => (true, Some(result), None),
            Err(error) => (false, None, Some(for_viewer(error, &viewer))),
        };
        Response {
            v: V1::CURRENT,
            id: Some(request.id.clone()),
            ok,
            result,
            error,
            events,
            awaiting: self.awaiting(),
            log_head: self.session.as_ref().map_or(0, |s| s.log_head()),
        }
    }

    fn run(&mut self, command: &Command, viewer: &Viewer) -> Result<CommandResult, ApiError> {
        match command {
            Command::Hello => {
                return Ok(CommandResult::Hello {
                    protocol: PROTOCOL_NAME.to_owned(),
                    version: CONTRACT_VERSION.to_owned(),
                    engine_rev: adapter::engine_rev().to_owned(),
                    schema_sha256: SCHEMA_SHA256.trim().to_owned(),
                });
            }
            Command::NewSession { seed } => {
                let seed = seed.unwrap_or_else(random_seed);
                adapter::seed_dice(seed);
                self.sessions_started += 1;
                self.session = Some(Session::new(self.data_dir.clone(), CONTRACT_VERSION, seed));
                return Ok(CommandResult::NewSession {
                    session_id: format!("s{}", self.sessions_started),
                    seed,
                });
            }
            _ => {}
        }
        let Some(session) = self.session.as_mut() else {
            return Err(errors::error(
                ErrorCode::NoSession,
                "Start a session with new_session first.",
            ));
        };
        // A creature viewer must be in the scene, except on load_scene, which checks the new one.
        // Before any scene a creature viewer gets the same no_scene as the DM.
        if !matches!(command, Command::LoadScene { .. }) && !session.knows_viewer(viewer) {
            if !session.has_scene() {
                return Err(errors::error(ErrorCode::NoScene, "Load a scene first."));
            }
            return Err(errors::error(
                ErrorCode::UnknownCreature,
                "The viewer must be dm or a creature in this scene.",
            ));
        }
        match command {
            Command::Hello | Command::NewSession { .. } => unreachable!("handled above"),
            Command::LoadScene { scene_id, party } => session.load_scene(scene_id, party, viewer),
            Command::StartCombat { encounter_id } => session.start_combat(encounter_id, viewer),
            Command::GetState => session.state(viewer),
            Command::EndCombat { reason } => session.end_combat(*reason, viewer),
            Command::LegalActions { actor } => session.legal_actions(&actor.0),
            Command::Submit {
                actor,
                prompt_id,
                option_id,
                targets,
                point,
                variant,
            } => {
                if point.is_some() || variant.is_some() {
                    return Err(errors::not_implemented(
                        "Options with a point or a variant",
                        "legal_actions does not offer them yet",
                    ));
                }
                session.submit(&actor.0, &prompt_id.0, option_id, targets)
            }
            Command::React {
                actor,
                prompt_id,
                choice,
            } => session.react(&actor.0, &prompt_id.0, *choice),
            Command::EndTurn { actor, prompt_id } => session.end_turn(&actor.0, &prompt_id.0),
            Command::Events { since } => Ok(CommandResult::Events {
                events: session.events(*since, viewer),
                next: session.log_head(),
            }),
            Command::Move {
                actor,
                to,
                prompt_id,
            } => session.move_creature(&actor.0, to, prompt_id.as_ref().map(|p| p.0.as_str())),
            Command::GetSheet { actor } => session.sheet(&actor.0, viewer),
            Command::RequestCheck { actor, check } => session.request_check(&actor.0, check),
            Command::ShortRest {
                participants,
                hit_dice,
            } => session.short_rest(participants, hit_dice),
            Command::Spawn { spawn_id } => session.spawn(spawn_id, viewer),
        }
    }

    fn awaiting(&mut self) -> Awaiting {
        match self.session.as_mut() {
            Some(session) => session.awaiting(),
            None => Awaiting::NoSession,
        }
    }

    fn failure(&mut self, id: Option<String>, error: ApiError) -> Response {
        Response {
            v: V1::CURRENT,
            id,
            ok: false,
            result: None,
            error: Some(error),
            events: Vec::new(),
            awaiting: self.awaiting(),
            log_head: self.session.as_ref().map_or(0, |s| s.log_head()),
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

fn encode(response: &Response) -> String {
    serde_json::to_string(response).expect("contract types always serialize")
}

/// Scene validation messages quote stat-block numbers (AC, proficiency bonus) that only the DM
/// may see (protocol §5), so a creature viewer gets a plain `bad_scene` and the details go to
/// stderr.
fn for_viewer(mut error: ApiError, viewer: &Viewer) -> ApiError {
    if error.code == ErrorCode::BadScene && *viewer != Viewer::Dm {
        eprintln!("bad_scene: {}", error.message);
        error.message = "The scene is invalid; the DM can see why.".into();
    }
    // Why a fight cannot end early names the encounter's scene rules (surrender, end reasons),
    // and an automatic spawn names its trigger: scenario data.
    if *viewer != Viewer::Dm {
        let player_message = match (error.code, error.reason) {
            (ErrorCode::SurrenderNotAvailable, _) => {
                Some("Surrender is not available in this fight right now; the DM can see why.")
            }
            (ErrorCode::Rejected, Some(RejectReason::ConditionNotMet)) => {
                Some("This fight cannot end that way right now; the DM can see why.")
            }
            (ErrorCode::Rejected, Some(RejectReason::Automatic)) => {
                Some("Those creatures arrive by themselves; the DM can see when.")
            }
            _ => None,
        };
        if let Some(message) = player_message {
            eprintln!("{:?}: {}", error.code, error.message);
            error.message = message.into();
        }
    }
    // Scene ids are scenario data: only the DM learns which ones exist.
    if *viewer != Viewer::Dm
        && let Some(hint) = &mut error.hint
    {
        hint.known_ids.clear();
        if hint.legal_option_ids.is_empty() && hint.awaiting.is_none() {
            error.hint = None;
        }
    }
    error
}

/// A seed for a session that did not ask for one, from the standard library's per-process
/// random hasher keys, so no RNG dependency is needed here.
fn random_seed() -> u32 {
    use std::hash::{BuildHasher, Hasher};
    std::collections::hash_map::RandomState::new()
        .build_hasher()
        .finish() as u32
}
