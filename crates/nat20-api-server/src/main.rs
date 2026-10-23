//! stdio JSON-lines loop: one request per stdin line, one response per stdout line, logs on stderr.

use std::io::{self, BufRead, Write};

use nat20_api_server::{Server, adapter, paths};

fn main() -> io::Result<()> {
    eprintln!(
        "nat20-api-server: nat20_core {} loaded {} classes",
        adapter::engine_rev(),
        adapter::loaded_class_count()
    );
    eprintln!(
        "nat20-api-server: scenes from {}, pregens from {}, maps from {}",
        paths::data_dir().join("scenes").display(),
        paths::pregens_dir().display(),
        paths::maps_dir().display()
    );
    let mut server = Server::new();
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        writeln!(stdout, "{}", server.handle_line(&line))?;
        stdout.flush()?;
    }
    Ok(())
}
