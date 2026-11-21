//! The Glass Table spike's shell (CON-20): starts the compiled host that sits next to it in
//! `Contents/MacOS`, reads the port and token from the host's first stdout line, and opens the page
//! with them. No game logic, as the design §3 asks of the real shell.

use std::io::{BufRead, BufReader};
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct Host(Mutex<Option<Child>>);

fn start_host() -> Result<(Child, String), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("no folder for the shell")?;
    let host = dir.join("glass-table-host");
    let mut child = Command::new(&host)
        .env("NAT20_API_SERVER", dir.join("nat20-api-server"))
        // Its own process group, so closing the window stops the host and whatever it started.
        .process_group(0)
        // Held open while the shell lives: the host exits when it closes.
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("{}: {e}", host.display()))?;
    let stdout = child.stdout.take().ok_or("host has no stdout")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).map_err(|e| e.to_string())?;
    // Keep reading, so a later stdout line from the host never meets a closed pipe.
    std::thread::spawn(move || std::io::copy(&mut reader, &mut std::io::sink()));
    let address: serde_json::Value =
        serde_json::from_str(line.trim()).map_err(|e| format!("host said {line:?}: {e}"))?;
    Ok((child, address.to_string()))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let (script, child) = match start_host() {
                Ok((child, address)) => (format!("window.__HOST__ = {address};"), Some(child)),
                Err(error) => (
                    format!(
                        "window.__HOST_ERROR__ = {};",
                        serde_json::Value::String(error)
                    ),
                    None,
                ),
            };
            app.manage(Host(Mutex::new(child)));
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Glass Table Spike")
                .inner_size(760.0, 560.0)
                .initialization_script(&script)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the shell could not start")
        .run(|app, event| {
            if let RunEvent::Exit = event
                && let Some(mut child) = app.state::<Host>().0.lock().unwrap().take()
            {
                let _ = Command::new("kill")
                    .args(["-TERM", &format!("-{}", child.id())])
                    .status();
                let _ = child.wait();
            }
        });
}
