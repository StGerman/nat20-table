//! A typed in-process client: contract requests in, contract responses out, through the same
//! JSON lines the stdio engine speaks.

use nat20_api_contract::{Command, Request, Response, V1, Viewer};
use nat20_api_server::Server;

pub struct Client {
    server: Server,
    next_id: u64,
}

impl Default for Client {
    fn default() -> Self {
        Self::new(Server::new())
    }
}

impl Client {
    pub fn new(server: Server) -> Self {
        Self { server, next_id: 0 }
    }

    /// Sends one command as `viewer` (`dm` or a creature handle) and returns the parsed response.
    pub fn send(&mut self, viewer: &str, command: Command) -> Response {
        self.next_id += 1;
        let request = Request {
            v: V1::CURRENT,
            id: format!("c-{}", self.next_id),
            viewer: Viewer(viewer.to_owned()),
            command,
        };
        let line = serde_json::to_string(&request).expect("requests serialize");
        let response = self.server.handle_line(&line);
        serde_json::from_str(&response).expect("the engine answers with a contract Response")
    }
}
