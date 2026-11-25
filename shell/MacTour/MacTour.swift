// The Mac shell's UI test (CON-23), at a table with no engine and no model: the replay host
// (ci/replay-host.ts) behind the real seat wire, over the wire that holds every kind of ask.
//
// `testEveryAskByMenuAndKey` answers each ask from the menu bar: by a command of the game's menu
// or by that command's key, turn about, so an answer by number, the human's own words and the
// pause are each given both ways. The socket is lost between a press and its send, the story's
// page is loaded again, and the host's second window takes the seat, as on the phone
// (Tour/Tour.swift); then the window is closed, which must tell the host `quit`. What the host
// heard is read by the job (ci/heard.ts, ci/mac-tour.sh).
//
// `testAWindowGrowsIntoABook` opens the window on a recorded run and makes it wide while the table
// is in it (`-widen`): the app must go on, as an open book.
//
// `testPictures` opens the window on recorded runs and keeps what it shows, light and dark: first
// as it opens, one page at a time, then wide (`-wide 1`), where it must be an open book
// (CON-25): the story beside «Где все» or «Лист», and no tabs.
import XCTest

final class MacTour: XCTestCase {
    /// The game's menu, as the Mac's language names it (`Words.game`). Every launch is a Russian Mac's,
    /// whatever the runner speaks, so the bar and the table's commands read in one language.
    private let game = "Игра"
    private let russian = ["-AppleLanguages", "(ru)"]
    private let pauseTitle = "Пауза"
    private let playHereTitle = "Играть здесь"

    override func setUp() {
        continueAfterFailure = true
    }

    /// A window that holds a table as tabs grows wide and becomes the open book, with the table in
    /// it: the same three pages go from the tabs to the book's two pages (CON-25). Stas's Mac,
    /// 2026-11-25: the app stopped there. First of the tests by its name: the system opens a window
    /// at the size it last had, and the pictures' last launches leave it wide.
    @MainActor
    func testAWindowGrowsIntoABook() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-replay", "yard.seat-wire.jsonl", "-to", "74", "-widen", "14"] + russian
        app.launch()
        pause(8)
        let window = app.windows.firstMatch
        try XCTSkipIf(window.frame.width >= 860, "the window opened wide: it has no width to cross")
        let right = app.descendants(matching: .any).matching(identifier: "book-right").firstMatch
        XCTAssertFalse(right.exists, "the window as it opens holds its pages as tabs")
        picture("40-before-it-grows")
        let end = Date().addingTimeInterval(30)
        while Date() < end, app.state == .runningForeground, window.frame.width < 860 { pause(1) }
        pause(4)
        XCTAssertEqual(app.state, .runningForeground, "the app is still running after its window grew")
        XCTAssertGreaterThanOrEqual(window.frame.width, 860, "`-widen` made the window wide")
        XCTAssertTrue(right.waitForExistence(timeout: 10), "the grown window is an open book")
        picture("41-grown-into-a-book")
        app.terminate()
    }

    @MainActor
    func testEveryAskByMenuAndKey() throws {
        let link = ProcessInfo.processInfo.environment["ASKS_LINK"] ?? ""
        try XCTSkipIf(link.isEmpty, "no table to sit at: TEST_RUNNER_ASKS_LINK is not set")
        let app = XCUIApplication()
        // The second message the pages hand over is lost with the socket; after the fourth the
        // story's page is loaded again.
        app.launchArguments = ["-table", link, "-tour", "1", "-keepSent", "1", "-dropBeforeSend", "2", "-reloadAfter", "4"] + russian
        app.launch()

        // The ask and the count of messages at the last answer: the same ask offered again after a
        // lost socket has another count, and is answered again.
        var pressed = ""
        var pictured = Set<String>()
        var missed = 0
        var ended = false
        for _ in 0..<60 {
            guard let now = until(app, 90, { $0.form == "ended" || ($0.link == "up" && $0.control != "none" && $0.key != pressed) }) else {
                XCTFail("the table stopped: \(mark(app)?.text ?? "no state"), last answered \(pressed)")
                break
            }
            if now.form == "ended" {
                ended = true
                break
            }
            if answer(app, now) {
                pressed = now.key
                missed = 0
                if pictured.insert(now.control).inserted {
                    picture("2\(pictured.count)-after-\(now.control)")
                }
            } else {
                missed += 1
                picture("20-no-command-for-\(now.control)-\(missed)")
                if missed >= 3 {
                    XCTFail("no command answered \(now.text)")
                    break
                }
            }
        }
        XCTAssertTrue(ended, "the run was played to its end: \(mark(app)?.text ?? "no state")")
        picture("30-the-end")
        for command in ["number", "words", "pause"] {
            XCTAssertTrue(byMenu.contains(command), "an ask was answered by the menu command: \(command)")
            XCTAssertTrue(byKey.contains(command), "an ask was answered by the command's key: \(command)")
        }

        // The host's own second window takes the seat (ci/replay-host.ts `take-seat`): the shell
        // says so and does not take it back until asked.
        let here = app.buttons["play-here"].firstMatch
        XCTAssertTrue(here.waitForExistence(timeout: 60), "the shell said the game is open elsewhere")
        pause(4)
        XCTAssertEqual(mark(app)?.link, "replaced", "a replaced shell does not ask for the seat again by itself")
        picture("31-open-elsewhere")
        // The seat is taken back from the menu: the dock's button has its command too.
        XCTAssertTrue(command(app, { $0.menuItems[self.playHereTitle].firstMatch }), "the menu takes the seat back")
        XCTAssertNotNil(until(app, 30) { $0.link == "up" }, "«Играть здесь» took the seat back")
        picture("32-back-here")

        // Closing the window, by its red button, ends the app and tells the host `quit` (the job
        // reads that it came): the page is asked for it after its window has gone.
        let close = app.windows.firstMatch.buttons[XCUIIdentifierCloseWindow].firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 10), "the window has its close button")
        close.click()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 30), "the app ended when it was closed")
    }

    @MainActor
    func testPictures() {
        let yard = ["-replay", "yard.seat-wire.jsonl", "-to", "74"]
        let wide = ["-wide", "1"]
        let shots: [(String, [String])] = [
            ("01-yard-turn-light", yard),
            ("02-yard-turn-dark", yard + ["-dark", "1"]),
            ("03-yard-list-light", yard + ["-open", "moves"]),
            ("04-yard-spent-light", ["-replay", "yard.seat-wire.jsonl", "-to", "92"]),
            ("05-road-card-light", ["-replay", "the-way-back-ru.seat-wire.jsonl", "-to", "17"]),
            ("06-road-card-dark", ["-replay", "the-way-back-ru.seat-wire.jsonl", "-to", "17", "-dark", "1"]),
            ("07-yard-where-light", yard + ["-screen", "where"]),
            ("08-yard-sheet-light", yard + ["-screen", "sheet"]),
            ("09-connect-ru-light", []),
            ("10-no-connection-ru-light", ["-table", "ws://127.0.0.1:9/?token=none"]),
            // The wide window comes last: the system keeps a window's size for the next launch.
            ("11-book-yard-turn-light", yard + wide),
            ("12-book-yard-turn-dark", yard + wide + ["-dark", "1"]),
            ("13-book-yard-sheet-light", yard + wide + ["-screen", "sheet"]),
            ("14-book-yard-list-light", yard + wide + ["-open", "moves"]),
            ("15-book-road-card-light", ["-replay", "the-way-back-ru.seat-wire.jsonl", "-to", "17"] + wide),
            ("16-book-road-card-dark", ["-replay", "the-way-back-ru.seat-wire.jsonl", "-to", "17", "-dark", "1"] + wide),
        ]
        for (name, arguments) in shots {
            let app = XCUIApplication()
            app.launchArguments = arguments + russian
            app.launch()
            pause(12)
            // The window is an open book from 860 points and holds its pages as tabs under that
            // (`MacTable.book`): the right page stands only in the book. Read against the width the
            // window has, not the one asked for: the system opens it at the size it last had.
            if arguments.contains("-replay") {
                let width = app.windows.firstMatch.frame.width
                if arguments.contains("-wide") {
                    XCTAssertGreaterThanOrEqual(width, 860, "\(name): `-wide 1` opens a wide window")
                }
                let right = app.descendants(matching: .any).matching(identifier: "book-right").firstMatch
                XCTAssertEqual(right.exists, width >= 860, "\(name): a window \(width) points wide")
            }
            if name.hasPrefix("01") {
                // The game's menu, open over the turn: each move with its key.
                let menu = app.menuBars.menuBarItems[game].firstMatch
                if menu.waitForExistence(timeout: 10) {
                    menu.click()
                    pause(1)
                    picture("00-the-menu")
                    app.typeKey(.escape, modifierFlags: [])
                    pause(1)
                }
            }
            picture(name)
            app.terminate()
        }
    }

    /// What the shell says stands now (`Shell.mark`, drawn with `-tour 1`).
    private struct Mark {
        let text: String
        let link: String
        let form: String
        let ask: String
        let control: String
        let count: String
        var key: String { "\(ask)#\(count)" }
    }

    private var byMenu = Set<String>()
    private var byKey = Set<String>()
    private var numbers = 0
    private var lines = 0

    @MainActor
    private func mark(_ app: XCUIApplication) -> Mark? {
        let element = app.staticTexts.matching(identifier: "shell-state").firstMatch
        guard element.exists else { return nil }
        // A static text's words are its value on the Mac and its label on the phone.
        let text = (element.value as? String).flatMap { $0.isEmpty ? nil : $0 } ?? element.label
        let parts = text.components(separatedBy: "|")
        guard parts.count == 5 else { return nil }
        return Mark(text: text, link: parts[0], form: parts[1], ask: parts[2], control: parts[3], count: parts[4])
    }

    @MainActor
    private func until(_ app: XCUIApplication, _ seconds: TimeInterval, _ holds: (Mark) -> Bool) -> Mark? {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if let now = mark(app), holds(now) { return now }
            pause(0.5)
        }
        return nil
    }

    /// Answers the open ask from the menu bar: a command of the game's menu, or its key.
    @MainActor
    private func answer(_ app: XCUIApplication, _ now: Mark) -> Bool {
        switch now.control {
        case "chips", "rows", "card", "answers":
            // An ask that is its own list stands in the window, under the story, row by row.
            if now.control != "chips" {
                let rows = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'choice-' OR identifier BEGINSWITH 'row-' OR identifier BEGINSWITH 'react-answer-'"))
                XCTAssertTrue(rows.firstMatch.waitForExistence(timeout: 10), "the \(now.control) ask's answers stand in the window")
            }
            // The first turn with chips is answered with the pause, from the menu: at an open ask
            // the pause is that ask's answer.
            if now.control == "chips", !byMenu.contains("pause") {
                guard command(app, { $0.menuItems[self.pauseTitle].firstMatch }) else { return false }
                byMenu.insert("pause")
                return true
            }
            numbers += 1
            // Where several answers are on offer, the second: each has a command of its own.
            let at = now.control == "answers" ? 1 : 0
            if numbers % 2 == 1 {
                guard command(app, { $0.menuItems.element(boundBy: at) }) else { return false }
                byMenu.insert("number")
            } else {
                app.typeKey(String(at + 1), modifierFlags: .command)
                byKey.insert("number")
            }
            return true
        case "reaction":
            app.typeKey("y", modifierFlags: .command)
            byKey.insert("yes")
            return true
        case "paused":
            // The pause is lifted by its key.
            app.typeKey("p", modifierFlags: .command)
            byKey.insert("pause")
            return true
        default:
            // The human's own words: the command opens the line, named as the dock names it.
            lines += 1
            if now.control == "line", lines % 2 == 1 {
                let dock = app.buttons["dock-line"].firstMatch
                guard dock.waitForExistence(timeout: 10) else { return false }
                let named = dock.label.isEmpty ? dock.title : dock.label
                guard command(app, { $0.menuItems[named].firstMatch }) else { return false }
                byMenu.insert("words")
            } else {
                app.typeKey("k", modifierFlags: .command)
                byKey.insert("words")
            }
            return write(app, now.control == "question" ? "Tie its hands and ask who sent it" : "I look around")
        }
    }

    /// Opens the game's menu and chooses the command `pick` finds in it.
    @MainActor
    private func command(_ app: XCUIApplication, _ pick: (XCUIElement) -> XCUIElement) -> Bool {
        let menu = app.menuBars.menuBarItems[game].firstMatch
        guard menu.waitForExistence(timeout: 15) else { return false }
        menu.click()
        let item = pick(menu)
        guard item.waitForExistence(timeout: 5), item.isEnabled else {
            app.typeKey(.escape, modifierFlags: [])
            return false
        }
        item.click()
        return true
    }

    @MainActor
    private func write(_ app: XCUIApplication, _ text: String) -> Bool {
        let field = app.textFields["type-line"].firstMatch
        guard field.waitForExistence(timeout: 15) else { return false }
        pause(1)
        field.click()
        field.typeText(text + "\n")
        return true
    }

    private func pause(_ seconds: TimeInterval) {
        Thread.sleep(forTimeInterval: seconds)
    }

    @MainActor
    private func picture(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
