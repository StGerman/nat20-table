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
    /// The line typed in the dock, and whether it is open over the keyboard.
    var draft = ""
    var typing = false
    /// Why the page would not take what was typed.
    var notice: String?
    /// How many messages the pages have handed over for the host.
    var sent = 0

    /// The table the shell sits at: none is the connect screen.
    var table: Table?
    /// A live table's socket; a recorded run is always "up".
    var link = Link.up
    /// The table is a live one: there is a socket, and leaving it is asked about.
    var live: Bool { wire != nil }
    /// The shell's own lines, in the table's language once it has said it.
    var words: Words { Words.of(chrome?.language) }
    @ObservationIgnored private var wire: Wire?
    @ObservationIgnored private var forcedFor: String?
    /// The sheet that is open shows what a command answered with (/options, /where).
    @ObservationIgnored private var answered = false
    /// The UI test's hooks (Tour/Tour.swift): `-tour 1` shows the state mark, `-keepSent 1` keeps
    /// what the pages handed over in a file, `-dropBeforeSend <n>` loses the socket and the nth
    /// message with it, `-reloadAfter <n>` loads the story's page again after the nth.
    let tour = UserDefaults.standard.bool(forKey: "tour")
    private let keepSent = UserDefaults.standard.bool(forKey: "keepSent")
    private let dropBeforeSend = UserDefaults.standard.integer(forKey: "dropBeforeSend")
    private let reloadAfter = UserDefaults.standard.integer(forKey: "reloadAfter")
    @ObservationIgnored private var kept: [String] = []

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
        // The UI test's file starts empty.
        if keepSent { keep() }
        // The pictures job's way to a state no finger reached: `-screen where|sheet`, `-open moves`, `-press <n>`.
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
        link = .down
        let next = Wire(
            url: url,
            // The pages' own place in the story: a page that was loaded again holds nothing, so the
            // host tells the run from the start and the other pages pass over what they have.
            from: { [weak self] in
                guard let table = self?.table else { return 0 }
                return min(table.story.seq, table.place.seq, table.sheet.seq)
            },
            line: { [weak self] text in self?.host(text) },
            state: { [weak self] link in
                say("nat20-wire \(link)")
                self?.linked(link)
            }
        )
        wire = next
        next.open()
    }

    /// The socket went or came back. While it is away the dock says so, and the ask's sheet does
    /// not stand over that line with rows that would do nothing; what was typed stays in the dock.
    /// When it is back the host offers the open ask again, and an ask that is its own list opens.
    private func linked(_ now: Link) {
        link = now
        if now == .up {
            forcedFor = nil
            offer()
        } else if opened == .moves {
            opened = nil
        }
    }

    /// Back to the connect screen. The table is told nothing: it goes on, the open ask waits, and
    /// the same link sits down again (it stays in the link field).
    func leave() {
        wire?.close()
        wire = nil
        table = nil
        chrome = nil
        opened = nil
        typing = false
        link = .up
        let defaults = UserDefaults.standard
        if let last = defaults.string(forKey: "table") { defaults.set(last, forKey: "lastTable") }
        defaults.removeObject(forKey: "table")
    }

    /// Another window took the seat and the human wants it back here.
    func playHere() {
        link = .down
        wire?.open()
    }

    /// A page was loaded again and holds nothing: the socket is opened again, so the host says
    /// `hello` and tells the run from the start. A recorded run's page reads its own file again.
    func cameBack() {
        say("nat20-diag a page came back")
        if link != .replaced { wire?.open() }
    }

    /// The app is on screen again: the system may have cut the socket or ended a page meanwhile.
    func woke() {
        guard let table else { return }
        wire?.check()
        table.story.check()
        table.place.check()
        table.sheet.check()
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
        chrome = next
        notice = nil
        offer()
    }

    /// An ask that is its own list (a pick, a road choice, a reaction, a question) opens its sheet
    /// once, and only over the story: «Где все» and «Лист» are read undisturbed, and the sheet
    /// opens when the human is back.
    func offer() {
        guard let dock = chrome?.dock else { return }
        if Self.answersStand {
            // The window shows such an ask under the story: the list of a turn that stood open
            // over it has nothing left to show.
            if opened == .moves, ownList || dock.sheet == nil { opened = nil }
            return
        }
        // No ask stands (it was answered, or the socket came back): if the same ask is offered
        // again, its sheet opens again.
        if dock.ask == nil { forcedFor = nil }
        let forced = dock.sheet?.forced == true || dock.card?.asked == true
        if forced, let ask = dock.ask {
            if forcedFor != ask, screen == .story {
                forcedFor = ask
                opened = .moves
            }
        } else if opened == .moves, dock.sheet == nil, dock.card == nil {
            opened = nil
        }
    }

    /// The dock's ask is its own list, not a turn's list of moves: a card, a reaction, a question,
    /// a pick of rows.
    var ownList: Bool {
        guard let dock = chrome?.dock else { return false }
        return dock.card != nil || dock.sheet?.forced == true
    }

    /// The Mac's window stands such an ask's answers under the story (Mac/Answers); the phone opens
    /// them as a sheet over it.
    #if os(macOS)
    static let answersStand = true
    #else
    static let answersStand = false
    #endif

    /// There is a list to open: a turn's moves, and on the phone an ask that is its own list.
    var listed: Bool {
        guard let dock = chrome?.dock, dock.sheet != nil || dock.card != nil else { return false }
        return !(Self.answersStand && ownList)
    }

    /// The page hands over a message for the host. With no host (a recorded run) it is only counted.
    func send(_ line: String) {
        say("nat20-send \(line)")
        sent += 1
        if keepSent {
            kept.append(line)
            keep()
        }
        if sent == dropBeforeSend {
            wire?.cut()
            return
        }
        wire?.send(line)
        if sent == reloadAfter { table?.story.recover() }
    }

    /// What the pages handed over, one message a line, where the UI test's job reads it: the app's
    /// documents on the phone, the user's temporary folder on the Mac (its documents are asked about).
    private func keep() {
        #if os(macOS)
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("nat20-sent.jsonl")
        #else
        guard let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let file = folder.appendingPathComponent("sent.jsonl")
        #endif
        let text = kept.map { $0 + "\n" }.joined()
        try? text.write(to: file, atomically: true, encoding: .utf8)
    }

    /// What the Mac's menu bar offers now: each answer the open ask takes by a number, then the
    /// rest of the dock's actions. The first nine answers take the keys 1 to 9.
    struct MenuState: Equatable {
        struct Item: Equatable, Identifiable {
            let n: Int
            let label: String
            var id: Int { n }
        }

        var pause: String
        /// The table is there to be paused: a live table or a recorded one, with the socket up.
        var table = false
        var moves: [Item] = []
        var yes: String?
        var no: String?
        var list: String?
        var line: String?
        /// A recorded run is left from the menu; a live table ends when the window is closed.
        var leave: String?
    }

    var menu: MenuState {
        let words = self.words
        var menu = MenuState(pause: chrome?.dock.form == "paused" ? words.goOn : words.pause)
        if table != nil, !live { menu.leave = words.leave }
        guard let dock = chrome?.dock, link == .up else { return menu }
        menu.table = true
        guard dock.open else { return menu }
        let item = { (move: Chrome.Move) in MenuState.Item(n: move.n, label: move.label) }
        if dock.form == "paused" {
            // Only the pause is lifted.
        } else if let card = dock.card, card.asked {
            menu.moves = card.choices.compactMap { choice in choice.n.map { MenuState.Item(n: $0, label: choice.text) } }
        } else if let reaction = dock.sheet?.reaction {
            if let answers = reaction.answers, !answers.isEmpty {
                menu.moves = answers.map { MenuState.Item(n: $0.n, label: $0.label) }
            } else {
                menu.yes = reaction.yes
            }
            menu.no = reaction.no
        } else if let sheet = dock.sheet, sheet.forced {
            menu.moves = sheet.groups.flatMap { $0.moves }.map(item)
        } else {
            menu.moves = (dock.chips + (dock.endTurn.map { [$0] } ?? [])).map(item)
        }
        if listed { menu.list = dock.more ?? words.whole }
        menu.line = dock.placeholder
        return menu
    }

    /// The human's own words, from the Mac's menu: the list's popover steps aside and the line
    /// opens for typing.
    func write() {
        if opened == .moves { opened = nil }
        screen = .story
        typing = true
    }

    /// The Mac's window is closed: the page is asked for a `quit`, which ends the run and has the
    /// host save the party (Glass Table design §7). The message is given a moment to leave.
    func quit() async {
        guard live, link == .up, let story = table?.story else { return }
        _ = await story.act(["kind": "command", "name": "quit"])
        try? await Task.sleep(for: .milliseconds(500))
    }

    /// One line on what stands now, for the UI test to read (`-tour 1`): the socket, the dock's
    /// form, the open ask, the control that answers it, and how many messages the pages handed over.
    var mark: String {
        guard let dock = chrome?.dock else { return "\(link)|none|-|none|\(sent)" }
        let control: String
        if !dock.open {
            control = "none"
        } else if dock.form == "reaction" {
            control = dock.sheet?.reaction?.answers?.isEmpty == false ? "answers" : "reaction"
        } else if dock.form == "paused" {
            control = "paused"
        } else if dock.form == "answer", dock.sheet?.question != nil {
            control = "question"
        } else if dock.card?.asked == true {
            control = "card"
        } else if dock.sheet?.forced == true {
            control = "rows"
        } else if !dock.chips.isEmpty || dock.endTurn != nil {
            control = "chips"
        } else {
            control = "line"
        }
        return "\(link)|\(dock.form)|\(dock.ask ?? "-")|\(control)|\(sent)"
    }

    func open(_ body: [String: Any]) {
        guard let what = body["what"] as? String else { return }
        if what == "rolls", let rolls = body["rolls"] as? [[String: Any]] {
            let rows = rolls.compactMap { $0["text"] as? String }
            let title = (rolls.first?["roller"] as? String) ?? ""
            opened = .lines(title: title, rows: rows)
            answered = false
        } else if what == "person", let name = body["name"] as? String {
            opened = .lines(title: name, rows: (body["rows"] as? [String]) ?? [])
            answered = false
        } else if what == "lines", let title = body["title"] as? String {
            // A forced sheet is the ask itself: what a command answered with does not cover it.
            if opened == .moves, chrome?.dock.sheet?.forced == true || chrome?.dock.card?.asked == true { return }
            opened = .lines(title: title, rows: (body["rows"] as? [String]) ?? [])
            answered = true
        } else if what == "none" {
            // The table moved on: what a command answered with goes, as the page's own overlay does.
            if answered, case .some(.lines) = opened { opened = nil }
            answered = false
            return
        }
        say("nat20-open \(what)")
    }

    /// «Лист» asks the seat for a sheet, as /sheet does, only when the page has none or an old one
    /// and the table waits on the human: the host answers and asks again under a new id, so every
    /// touch of the tab would otherwise be an answer.
    func freshSheet() {
        if let chrome, chrome.sheetStale, chrome.dock.open { act(["kind": "command", "name": "sheet"]) }
    }

    func press(_ n: Int) {
        act(["kind": "option", "n": n])
    }

    func react(_ take: Bool) {
        act(["kind": "reaction", "take": take])
    }

    /// The table's pause, on and off: what a typed /pause does.
    func pause() {
        act(["kind": "command", "name": "pause"])
    }

    func typed(_ text: String, done: @escaping (Bool) -> Void) {
        act(["kind": "typed", "text": text], done: done)
    }

    private func act(_ what: [String: Any], done: ((Bool) -> Void)? = nil) {
        Task {
            guard let story = table?.story else { return }
            // A press that cannot reach the table is not handed to the page, which would show the
            // ask as answered.
            guard link == .up else {
                done?(false)
                return
            }
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
            guard let json = body["json"] as? String, let data = json.data(using: .utf8) else { return }
            do {
                let chrome = try JSONDecoder().decode(Chrome.self, from: data)
                content?.seq = chrome.seq
                if main { shell?.apply(chrome) }
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
