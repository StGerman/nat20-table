// The seat wire's socket, held by the shell (game/src/seat-wire): every line the host sends goes to
// the pages as it came, and what a page hands over goes back as the page wrote it. The shell reads
// one thing itself, an event's number, so a dropped socket asks for what it missed.
import Foundation

@MainActor
final class Wire {
    private let url: URL
    private let line: (String) -> Void
    private let state: (Bool) -> Void
    private var task: URLSessionWebSocketTask?
    private var seq = 0
    private var closed = false

    init(url: URL, line: @escaping (String) -> Void, state: @escaping (Bool) -> Void) {
        self.url = url
        self.line = line
        self.state = state
    }

    func open() {
        guard !closed else { return }
        let task = URLSession.shared.webSocketTask(with: url)
        self.task = task
        task.resume()
        // Queued until the socket is up: the host answers with what follows `seq` and the open ask.
        send("{\"type\":\"resume\",\"seq\":\(seq)}")
        Task { await self.listen(task) }
    }

    func send(_ text: String) {
        guard let task else { return }
        task.send(.string(text)) { error in
            if let error {
                say("nat20-wire send failed: \(error.localizedDescription)")
            }
        }
    }

    func close() {
        closed = true
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func listen(_ task: URLSessionWebSocketTask) async {
        var heard = false
        do {
            while true {
                let message = try await task.receive()
                guard self.task === task else { return }
                if !heard {
                    heard = true
                    state(true)
                }
                switch message {
                case .string(let text):
                    got(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) { got(text) }
                @unknown default:
                    break
                }
            }
        } catch {
            guard self.task === task, !closed else { return }
            say("nat20-wire dropped: \(error.localizedDescription)")
            state(false)
            // A dropped socket comes back and asks for what it missed.
            try? await Task.sleep(for: .seconds(1))
            if self.task === task { open() }
        }
    }

    private func got(_ text: String) {
        if let data = text.data(using: .utf8),
           let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
           body["type"] as? String == "event",
           let n = body["seq"] as? Int, n > seq {
            seq = n
        }
        line(text)
    }
}
