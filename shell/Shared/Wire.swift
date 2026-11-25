// The seat wire's socket, held by the shell (game/src/seat-wire): every line the host sends goes to
// the pages as it came, and what a page hands over goes back as the page wrote it. The shell writes
// one message of its own, `resume`, from the place in the story its pages hold; a ping is a
// WebSocket control frame, not a message. A socket found dead (a send that fails, a ping with no
// answer) comes back and asks again, and the host then offers the open ask once more.
import Foundation

/// The socket to the table: up, down and coming back, or closed because another window took the seat.
enum Link: Equatable {
    case up, down, replaced
}

@MainActor
final class Wire {
    /// The seat's close code for a window it replaced (`CLOSE_REPLACED`, game/src/seat-wire/messages.ts).
    private static let replacedCode = 4001
    /// Seconds between pings. A ping still unanswered at the next one, with no line from the host
    /// since, means the socket is dead.
    private static let every = 10

    private let url: URL
    private let line: (String) -> Void
    private let state: (Link) -> Void
    /// The last event every page has: what `resume` asks from.
    private let from: () -> Int
    private var task: URLSessionWebSocketTask?
    private var beat: Task<Void, Never>?
    private var link = Link.down
    /// When the ping that has no answer yet was sent.
    private var pinged: Date?
    private var closed = false

    init(url: URL, from: @escaping () -> Int, line: @escaping (String) -> Void, state: @escaping (Link) -> Void) {
        self.url = url
        self.from = from
        self.line = line
        self.state = state
    }

    /// Opens the socket, or opens it again in place of the one that is up: the host says `hello`
    /// and replays what follows the pages' place in the story, then what stands now.
    func open() {
        guard !closed else { return }
        beat?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        let task = URLSession.shared.webSocketTask(with: url)
        self.task = task
        pinged = nil
        task.resume()
        // Queued until the socket is up.
        write("{\"type\":\"resume\",\"seq\":\(from())}", on: task)
        Task { await self.listen(task) }
        beat = Task { await self.pulse(task) }
    }

    /// A line a page wrote for the host. Whether it left is not known here: if it did not, the
    /// socket is found dead and comes back, and the host offers its open ask again.
    func send(_ text: String) {
        guard let task else {
            say("nat20-wire not sent: no socket")
            return
        }
        write(text, on: task)
    }

    /// The human left the table: the socket goes and does not come back.
    func close() {
        closed = true
        beat?.cancel()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    /// The app is on screen again: a socket the system cut while it was away is found now, not at the next ping.
    func check() {
        guard let task, link == .up else { return }
        if pinged == nil { ping(task) }
        Task {
            try? await Task.sleep(for: .seconds(3))
            if self.task === task, let since = self.pinged, Date().timeIntervalSince(since) >= 3 {
                self.drop(task, "no answer to a ping")
            }
        }
    }

    /// Drops the socket as a lost network would (the UI test's hook, `-dropBeforeSend`).
    func cut() {
        if let task { drop(task, "cut") }
    }

    private func write(_ text: String, on task: URLSessionWebSocketTask) {
        task.send(.string(text)) { error in
            guard let error else { return }
            Task { @MainActor in
                self.drop(task, "send failed: \(error.localizedDescription)")
            }
        }
    }

    private func listen(_ task: URLSessionWebSocketTask) async {
        do {
            while true {
                let message = try await task.receive()
                guard self.task === task else { return }
                // A line from the host says the socket is alive as well as a pong does: in a burst
                // of lines the pong waits its turn behind them, and a live socket is not dropped.
                pinged = nil
                if link != .up {
                    link = .up
                    state(.up)
                }
                switch message {
                case .string(let text):
                    line(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) { line(text) }
                @unknown default:
                    break
                }
            }
        } catch {
            guard self.task === task, !closed else { return }
            // The close frame's code may land a moment after the read fails.
            if task.closeCode == .invalid { try? await Task.sleep(for: .milliseconds(300)) }
            guard self.task === task, !closed else { return }
            let reason = task.closeReason.flatMap { String(data: $0, encoding: .utf8) }
            if task.closeCode.rawValue == Wire.replacedCode || reason == "replaced" {
                // Another window sits here now. Asking again would take the seat back from it, and
                // it from this one, every second: the human says where they play.
                beat?.cancel()
                self.task = nil
                link = .replaced
                state(.replaced)
                return
            }
            drop(task, "dropped: \(error.localizedDescription)")
        }
    }

    /// The socket is dead: it goes, the shell is told, and a second later it is opened again.
    private func drop(_ task: URLSessionWebSocketTask, _ why: String) {
        guard self.task === task, !closed else { return }
        say("nat20-wire \(why)")
        beat?.cancel()
        self.task = nil
        task.cancel(with: .goingAway, reason: nil)
        link = .down
        state(.down)
        Task {
            try? await Task.sleep(for: .seconds(1))
            if self.task == nil, self.link == .down, !self.closed { self.open() }
        }
    }

    private func pulse(_ task: URLSessionWebSocketTask) async {
        while true {
            try? await Task.sleep(for: .seconds(Wire.every))
            guard !Task.isCancelled, self.task === task else { return }
            if let since = pinged {
                // A ping sent a moment ago (`check`) is still on its way.
                if Date().timeIntervalSince(since) < 5 { continue }
                drop(task, "no answer to a ping")
                return
            }
            ping(task)
        }
    }

    private func ping(_ task: URLSessionWebSocketTask) {
        pinged = Date()
        task.sendPing { error in
            Task { @MainActor in
                guard self.task === task else { return }
                if let error {
                    self.drop(task, "ping failed: \(error.localizedDescription)")
                } else {
                    self.pinged = nil
                }
            }
        }
    }
}
