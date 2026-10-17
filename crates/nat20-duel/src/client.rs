//! A typed in-process client: contract requests in, contract responses out, through the same
//! JSON lines the stdio engine speaks.

use nat20_api_contract::{Command, Request, Response, V1, Viewer};
use nat20_api_server::Server;

pub struct Client {
    server: Server,
    id_prefix: String,
    next_id: u64,
    /// Every request line sent and the response line it got, in order.
    pub lines: Vec<(String, String)>,
}

impl Default for Client {
    fn default() -> Self {
        Self::new(Server::new())
    }
}

impl Client {
    pub fn new(server: Server) -> Self {
        Self::with_id_prefix(server, "c")
    }

    /// A client whose request ids are `<prefix>-1`, `<prefix>-2`, ...
    pub fn with_id_prefix(server: Server, prefix: &str) -> Self {
        Self {
            server,
            id_prefix: prefix.to_owned(),
            next_id: 0,
            lines: Vec::new(),
        }
    }

    /// Sends one command as `viewer` (`dm` or a creature handle) and returns the parsed response.
    pub fn send(&mut self, viewer: &str, command: Command) -> Response {
        self.next_id += 1;
        let request = Request {
            v: V1::CURRENT,
            id: format!("{}-{}", self.id_prefix, self.next_id),
            viewer: Viewer(viewer.to_owned()),
            command,
        };
        let line = serde_json::to_string(&request).expect("requests serialize");
        let response = self.server.handle_line(&line);
        let parsed =
            serde_json::from_str(&response).expect("the engine answers with a contract Response");
        self.lines.push((line, response));
        parsed
    }
}
