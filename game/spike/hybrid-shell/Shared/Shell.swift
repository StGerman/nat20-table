// The shell's one model: what the page last said the controls show, what is open on top, and the
// way back to the page for what the human did on a control.
import Foundation
import Observation
import SwiftUI
import WebKit

/// One line in the log, for the pictures job to read back.
func say(_ line: String) {
    NSLog("%@", line)
}

enum Screen: Hashable {
    case story, place, sheet
}

/// What a sheet shows: the moves of the open ask, a roll's lines, or a person's card.
enum Opened: Identifiable, Equatable {
    case moves
    case lines(title: String, rows: [String])

    var id: String {
        switch self {
        case .moves: return "moves"
        case .lines(let title, _): return "lines-\(title)"
        }
    }
}

@MainActor
@Observable
final class Shell {
    var chrome: Chrome?
    var screen: Screen = .story
    var opened: Opened?
    /// Why the page would not take what was typed.
    var notice: String?
    /// What the page handed over for the host, newest last.
    var sent: [String] = []

    @ObservationIgnored private(set) var story: Content!
    @ObservationIgnored private(set) var place: Content!
    @ObservationIgnored private(set) var sheet: Content!
    @ObservationIgnored private var forcedFor: String?

    init() {
        let defaults = UserDefaults.standard
        let replay = defaults.string(forKey: "replay") ?? "yard.seat-wire.jsonl"
        let to = defaults.string(forKey: "to")
        story = Content(show: "story", replay: replay, to: to, shell: self)
        place = Content(show: "where", replay: replay, to: to, shell: nil)
        sheet = Content(show: "sheet", replay: replay, to: to, shell: nil)
        // The spike's way to show a state no finger reached: `-open moves`, `-press <n>`.
        if defaults.string(forKey: "open") == "moves" {
            Task {
                try? await Task.sleep(for: .seconds(8))
                self.opened = .moves
            }
        }
        if let press = Int(defaults.string(forKey: "press") ?? "") {
            Task {
                try? await Task.sleep(for: .seconds(8))
                self.press(press)
            }
        }
    }

    /// The page says what the controls show now.
    func apply(_ next: Chrome) {
        if next.dock.form != chrome?.dock.form || next.dock.ask != chrome?.dock.ask {
            let sheet = next.dock.sheet.map { $0.forced ? "forced" : "yes" } ?? "no"
            say("nat20-chrome seq=\(next.seq) form=\(next.dock.form) ask=\(next.dock.ask ?? "-") chips=\(next.dock.chips.count) sheet=\(sheet) card=\(next.dock.card == nil ? "no" : "yes")")
        }
        chrome = next
        notice = nil
        // An ask that is its own list (a pick, a road choice, a reaction, a question) opens its sheet once.
        let forced = next.dock.sheet?.forced == true || next.dock.card?.asked == true
        if forced, let ask = next.dock.ask, forcedFor != ask {
            forcedFor = ask
            opened = .moves
        } else if opened == .moves, next.dock.sheet == nil, next.dock.card == nil {
            opened = nil
        }
    }

    /// The page hands over a message for the host. With no host (a recorded run) it is only kept.
    func send(_ line: String) {
        say("nat20-send \(line)")
        sent.append(line)
    }

    func open(_ body: [String: Any]) {
        guard let what = body["what"] as? String else { return }
        if what == "rolls", let rolls = body["rolls"] as? [[String: Any]] {
            let rows = rolls.compactMap { $0["text"] as? String }
            let title = (rolls.first?["roller"] as? String) ?? ""
            opened = .lines(title: title, rows: rows)
        } else if what == "person", let name = body["name"] as? String {
            opened = .lines(title: name, rows: (body["rows"] as? [String]) ?? [])
        }
    }

    func press(_ n: Int) {
        act(["kind": "option", "n": n])
    }

    func react(_ take: Bool) {
        act(["kind": "reaction", "take": take])
    }

    func typed(_ text: String, done: @escaping (Bool) -> Void) {
        act(["kind": "typed", "text": text], done: done)
    }

    private func act(_ what: [String: Any], done: ((Bool) -> Void)? = nil) {
        Task {
            let result = await story.act(what)
            if result.ok {
                if opened == .moves { opened = nil }
            } else if let notice = result.notice {
                self.notice = notice
            }
            say("nat20-act \(what["kind"] ?? "?") ok=\(result.ok) notice=\(result.notice ?? "-")")
            done?(result.ok)
        }
    }
}

/// The page's messages to the shell (`window.webkit.messageHandlers.shell`).
@MainActor
final class Bridge: NSObject, WKScriptMessageHandler {
    weak var shell: Shell?

    init(shell: Shell) {
        self.shell = shell
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "chrome":
            guard let json = body["json"] as? String, let data = json.data(using: .utf8) else { return }
            do {
                let chrome = try JSONDecoder().decode(Chrome.self, from: data)
                shell?.apply(chrome)
            } catch {
                say("nat20-diag chrome did not decode: \(error)")
            }
        case "send":
            if let message = body["message"], let data = try? JSONSerialization.data(withJSONObject: message), let line = String(data: data, encoding: .utf8) {
                shell?.send(line)
            }
        case "open":
            shell?.open(body)
        case "ready":
            say("nat20-diag the page is ready")
        default:
            break
        }
    }
}
