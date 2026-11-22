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

    /// The table the shell sits at: none is the connect screen.
    var table: Table?
    /// A live table's socket is up; a recorded run is always "up".
    var online = true
    @ObservationIgnored private var wire: Wire?
    @ObservationIgnored private var forcedFor: String?
    /// The ask a command's answer (/options, /sheet) was shown under: the sheet goes when the table moves on.
    @ObservationIgnored private var answered: String?

    static let shared = Shell()
    /// The app's name as the project file gives it (`APP_NAME` in project.yml), the one place it is written.
    static let appName = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? ""

    private init() {
        let defaults = UserDefaults.standard
        // `-replay <file>` shows a recorded run; `-table <link>` (or the link kept from last time) is a live table.
        if let replay = defaults.string(forKey: "replay") {
            sit(.replay(name: replay, to: defaults.string(forKey: "to")))
        } else if let link = defaults.string(forKey: "table"), let url = URL(string: link) {
            connect(url, keep: false)
        }
        // The spike's way to show a state no finger reached: `-screen where|sheet`, `-open moves`, `-press <n>`.
        switch defaults.string(forKey: "screen") {
        case "where": screen = .place
        case "sheet": screen = .sheet
        default: break
        }
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

    /// Sits at a table: three pages of the same run, one per tab.
    func sit(_ source: Source) {
        chrome = nil
        opened = nil
        screen = .story
        table = Table(
            story: Content(show: "story", source: source, main: true, shell: self),
            place: Content(show: "where", source: source, main: false, shell: self),
            sheet: Content(show: "sheet", source: source, main: false, shell: self)
        )
    }

    /// A live table by its link (`ws://<host>:<port>/?token=…`, printed by the run on the Mac).
    func connect(_ url: URL, keep: Bool) {
        // The link holds the run's token: only where it points is logged.
        say("nat20-wire connect \(url.host ?? "?"):\(url.port ?? 0)")
        if keep { UserDefaults.standard.set(url.absoluteString, forKey: "table") }
        self.wire?.close()
        sit(.live)
        online = false
        let next = Wire(
            url: url,
            line: { [weak self] text in self?.host(text) },
            state: { [weak self] on in
                self?.online = on
                say("nat20-wire \(on ? "up" : "down")")
            }
        )
        wire = next
        next.open()
    }

    /// Back to the connect screen.
    func leave() {
        wire?.close()
        wire = nil
        table = nil
        chrome = nil
        opened = nil
        online = true
        UserDefaults.standard.removeObject(forKey: "table")
    }

    private func host(_ text: String) {
        guard let table else { return }
        table.story.host(text)
        table.place.host(text)
        table.sheet.host(text)
    }

    /// The page says what the controls show now.
    func apply(_ next: Chrome) {
        if next.dock.form != chrome?.dock.form || next.dock.ask != chrome?.dock.ask {
            let sheet = next.dock.sheet.map { $0.forced ? "forced" : "yes" } ?? "no"
            say("nat20-chrome seq=\(next.seq) form=\(next.dock.form) ask=\(next.dock.ask ?? "-") chips=\(next.dock.chips.count) sheet=\(sheet) card=\(next.dock.card == nil ? "no" : "yes")")
        }
        if let under = answered, under != (next.dock.ask ?? "-") {
            answered = nil
            if case .some(.lines) = opened { opened = nil }
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
        wire?.send(line)
    }

    func open(_ body: [String: Any]) {
        guard let what = body["what"] as? String else { return }
        if what == "rolls", let rolls = body["rolls"] as? [[String: Any]] {
            let rows = rolls.compactMap { $0["text"] as? String }
            let title = (rolls.first?["roller"] as? String) ?? ""
            opened = .lines(title: title, rows: rows)
        } else if what == "person", let name = body["name"] as? String {
            opened = .lines(title: name, rows: (body["rows"] as? [String]) ?? [])
        } else if what == "lines", let title = body["title"] as? String {
            // A forced sheet is the ask itself: what a command answered with does not cover it.
            if opened == .moves, chrome?.dock.sheet?.forced == true || chrome?.dock.card?.asked == true { return }
            opened = .lines(title: title, rows: (body["rows"] as? [String]) ?? [])
            answered = chrome?.dock.ask ?? "-"
        }
        say("nat20-open \(what)")
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
            guard let story = table?.story else { return }
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

/// The three pages of one table.
@MainActor
final class Table {
    let story: Content
    let place: Content
    let sheet: Content

    init(story: Content, place: Content, sheet: Content) {
        self.story = story
        self.place = place
        self.sheet = sheet
    }
}

/// A page's messages to the shell (`window.webkit.messageHandlers.shell`).
@MainActor
final class Bridge: NSObject, WKScriptMessageHandler {
    weak var shell: Shell?
    weak var content: Content?
    /// The story's page: only its word on the controls and on what was touched is taken.
    private let main: Bool

    init(shell: Shell, main: Bool) {
        self.shell = shell
        self.main = main
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "chrome":
            guard main, let json = body["json"] as? String, let data = json.data(using: .utf8) else { return }
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
            if main { shell?.open(body) }
        case "ready":
            content?.isReady()
            if main { say("nat20-diag the page is ready") }
        default:
            break
        }
    }
}
