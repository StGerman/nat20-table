// Glass Table spike (CON-20, decision 0093): the Mac app's half of the question. A SwiftUI window
// that starts the compiled host (../host.ts) from inside its own bundle, as the Mac shell will start
// the table, reads the port and the token from the host's first line, connects its own socket, as
// the shell's Wire does, and lists each item the host checked. Closing its window leaves the app
// and the host running (decision 0100); the app ends the host when it quits, and SIGTERM quits it
// as Cmd-Q does, so run.sh can check that path with no Automation permission.
import AppKit
import SwiftUI

/// One line of the host's report.
struct Item: Identifiable, Decodable {
    let id: String
    let ok: Bool
    let detail: String
    let ms: Int?
}

/// What the host says over the socket: the items so far, one more item, or where the report is.
private struct Message: Decodable {
    let type: String
    let items: [Item]?
    let item: Item?
    let report: String?
    let all_ok: Bool?
}

/// The host's first line on its standard output.
private struct Seat: Decodable {
    let port: Int
    let token: String
}

@MainActor
@Observable
final class Spike {
    /// One for the app: the window shows it, and the app ends its host when it quits.
    static let shared = Spike()

    var state = "Starting the host."
    var items: [Item] = []
    private var host: Process?
    /// The host's standard input. Nothing is written to it: the host ends itself when it closes,
    /// which it does when this app is gone, however it went.
    private var input: Pipe?
    private var output: Pipe?
    private var socket: URLSessionWebSocketTask?

    /// Starts the host that sits beside the app's own program in the bundle, with the engine beside both.
    func start() {
        guard host == nil, let folder = Bundle.main.executableURL?.deletingLastPathComponent() else { return }
        let process = Process()
        process.executableURL = folder.appendingPathComponent("glass-table-host")
        var environment = ProcessInfo.processInfo.environment
        environment["NAT20_API_SERVER"] = folder.appendingPathComponent("nat20-api-server").path
        process.environment = environment
        let input = Pipe()
        let output = Pipe()
        process.standardInput = input
        process.standardOutput = output
        process.terminationHandler = { ended in
            let status = ended.terminationStatus
            Task { @MainActor in
                if self.socket == nil { self.state = "The host ended with status \(status) before it gave its address." }
            }
        }
        do {
            try process.run()
        } catch {
            state = "The app could not start the host: \(error.localizedDescription)"
            return
        }
        host = process
        self.input = input
        self.output = output
        Task {
            do {
                for try await line in output.fileHandleForReading.bytes.lines {
                    guard let seat = try? JSONDecoder().decode(Seat.self, from: Data(line.utf8)) else {
                        self.state = "The host's first line is not an address: \(line)"
                        return
                    }
                    self.connect(seat)
                    return
                }
            } catch {
                self.state = "The host's first line could not be read: \(error.localizedDescription)"
            }
        }
    }

    /// The window has closed: the host checks that the app is still there afterwards.
    func windowClosed() {
        socket?.send(.string(#"{"type":"window_closed"}"#)) { _ in }
    }

    /// Ends the host with the app.
    func stop() {
        socket?.cancel(with: .goingAway, reason: nil)
        host?.terminate()
    }

    private func connect(_ seat: Seat) {
        guard let url = URL(string: "ws://127.0.0.1:\(seat.port)/seat?token=\(seat.token)") else { return }
        let task = URLSession.shared.webSocketTask(with: url)
        socket = task
        task.resume()
        state = "Connecting to 127.0.0.1:\(seat.port)."
        // What the host cannot see of the app: its system, and whether it runs in a sandbox.
        let info = ProcessInfo.processInfo
        let sandbox = info.environment["APP_SANDBOX_CONTAINER_ID"] == nil ? "no sandbox" : "in a sandbox"
        let hello = ["type": "shell", "client": "URLSession, macOS \(info.operatingSystemVersionString), \(sandbox)"]
        if let data = try? JSONEncoder().encode(hello), let text = String(data: data, encoding: .utf8) {
            task.send(.string(text)) { error in
                guard let error else { return }
                Task { @MainActor in self.state = "The socket to 127.0.0.1:\(seat.port) failed: \(error.localizedDescription)" }
            }
        }
        Task { await self.listen(task, seat.port) }
    }

    private func listen(_ task: URLSessionWebSocketTask, _ port: Int) async {
        do {
            while true {
                guard case .string(let text) = try await task.receive(),
                      let message = try? JSONDecoder().decode(Message.self, from: Data(text.utf8)) else { continue }
                switch message.type {
                case "hello":
                    state = "Connected to 127.0.0.1:\(port)."
                    items = message.items ?? []
                case "item":
                    if let item = message.item, !items.contains(where: { $0.id == item.id }) { items.append(item) }
                case "close_window":
                    // As the red button does: the window goes, and the app must stay.
                    NSApp.windows.first(where: { $0.isVisible })?.performClose(nil)
                case "done":
                    state = (message.all_ok == true ? "All items work. " : "Some items failed. ") + "Report: " + (message.report ?? "")
                default:
                    break
                }
            }
        } catch {
            if !state.hasPrefix("All items") && !state.hasPrefix("Some items") {
                state = "The socket to 127.0.0.1:\(port) closed: \(error.localizedDescription)"
            }
        }
    }
}

/// Closing the window leaves the app running (decision 0100); quitting the app ends the host.
@MainActor
final class Closing: NSObject, NSApplicationDelegate {
    private var term: DispatchSourceSignal?

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    /// SIGTERM quits the app the way Cmd-Q does, through `terminate`, so the host is ended in order.
    func applicationDidFinishLaunching(_ notification: Notification) {
        signal(SIGTERM, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        source.setEventHandler { NSApp.terminate(nil) }
        source.resume()
        term = source
    }

    func applicationWillTerminate(_ notification: Notification) {
        Spike.shared.stop()
    }
}

@main
struct SpikeApp: App {
    @NSApplicationDelegateAdaptor(Closing.self) private var closing
    @State private var spike = Spike.shared

    var body: some Scene {
        Window("Glass Table Spike", id: "spike") {
            VStack(alignment: .leading, spacing: 12) {
                Text(spike.state)
                    .textSelection(.enabled)
                List(spike.items) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Label(item.id + (item.ms.map { " (\($0) ms)" } ?? ""), systemImage: item.ok ? "checkmark.circle" : "xmark.octagon")
                            .foregroundStyle(item.ok ? Color.primary : Color.red)
                        Text(item.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
            }
            .padding()
            .frame(minWidth: 640, minHeight: 420)
            .onAppear { spike.start() }
            .onDisappear { spike.windowClosed() }
        }
    }
}
