// The shell's UI test (CON-22), on a simulator at a table with no engine and no model: the replay
// host (ci/replay-host.ts) behind the real seat wire.
//
// `testATurnAtALiveTable` is a finger's tour for the recording: it presses a move, opens the list
// and picks from it, types a line, scrolls the story, visits the other tabs and leaves the table.
// It checks little: the video and the pictures it leaves are what gets read.
//
// `testEveryKindOfAsk` is the check (SwiftUI shell design §3): over the wire that holds every kind
// of ask it answers each with the control the shell put up, loses the socket between a press and
// its send, has the story's page loaded again, and is closed as a replaced window and takes the
// seat back. What the host heard is then read against what the pages handed over (ci/heard.ts).
import XCTest

final class Tour: XCTestCase {
    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor
    func testATurnAtALiveTable() throws {
        let link = ProcessInfo.processInfo.environment["TABLE_LINK"] ?? ""
        try XCTSkipIf(link.isEmpty, "no table to sit at: TEST_RUNNER_TABLE_LINK is not set")
        let app = XCUIApplication()
        app.launchArguments = ["-table", link]
        app.launch()

        let chip = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'chip-'")).firstMatch
        XCTAssertTrue(chip.waitForExistence(timeout: 90), "the turn's chips came over the socket")
        picture(app, "01-the-turn")
        audit(app, "the turn")
        // The audit tries the screen at other text sizes and sets it back as it ends: the screen is
        // left to stand before it is pressed.
        pause(3)

        // A chip is a move: the host answers and the story goes on to the next ask.
        chip.tap()
        pause(4)
        picture(app, "02-after-a-chip")

        // The whole list, and a move from it.
        let list = app.buttons["dock-list"]
        if list.waitForExistence(timeout: 20) {
            list.tap()
            let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'row-'")).firstMatch
            if row.waitForExistence(timeout: 10) {
                picture(app, "03-the-list")
                app.swipeUp()
                pause(1)
                picture(app, "04-the-list-scrolled")
                app.swipeDown()
                pause(1)
                row.tap()
                pause(4)
            }
        }
        picture(app, "05-after-a-row")

        // The human's own words, typed in the dock. A sheet may stand over it (the recording answers
        // a /where here): it is drawn down first, as a thumb would.
        let line = app.buttons["dock-line"].firstMatch
        if line.waitForExistence(timeout: 20) {
            for _ in 0..<3 where !line.isHittable {
                picture(app, "06-a-sheet-over-the-dock")
                let grabber = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.49))
                grabber.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.99)))
                pause(2)
            }
            // The dock's line opens a line over the keyboard, where what is typed can be read. Each
            // step is held to: a line that did not open or was not sent passed unseen before.
            XCTAssertTrue(line.isHittable, "the dock's line can be touched")
            let field = app.textFields["type-line"]
            XCTAssertTrue(openLine(app, line, field), "the line opens over the keyboard")
            field.typeText("I look around")
            // A simulator that has not typed since it booted asks the system for the keyboard's
            // language data at the first key, and a runner has none: the app stands until the
            // request fails (7 s in one round, 67 s in another). The tour waits for the line as a
            // person would, and says how long it took.
            let typed = Date()
            let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "I look around"), object: field)
            XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 120), .completed, "the line shows what was typed")
            let waited = Int(Date().timeIntervalSince(typed))
            if waited > 15 { print("nat20-tour the typed line showed after \(waited) s") }
            picture(app, "07-the-keyboard")
            field.typeText("\n")
            // The line is sent: it goes, and its keyboard with it.
            let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
            XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: 60), .completed, "the keyboard goes when the line is sent")
            pause(2)
            picture(app, "08-after-typing")
        }

        // The story under the bars: scrolled back, the tab bar steps aside; scrolled on, it returns.
        app.swipeDown()
        pause(1)
        picture(app, "09-scrolled-back")
        app.swipeUp()
        pause(1)
        picture(app, "10-scrolled-on")

        // The other tabs.
        for (index, name) in ["11-where", "12-sheet", "13-story-again"].enumerated() {
            let tab = app.tabBars.buttons.element(boundBy: (index + 1) % 3)
            if tab.waitForExistence(timeout: 10) {
                tab.tap()
                pause(3)
            }
            picture(app, name)
        }

        // Leaving: the shell asks first and says the game goes on, then shows the link screen with
        // the link still in the field. The host is told nothing (ci/tour.sh reads that no `quit` came).
        let menu = app.buttons["menu"].firstMatch
        if menu.waitForExistence(timeout: 10) {
            menu.tap()
            let leave = app.buttons["menu-leave"].firstMatch
            if leave.waitForExistence(timeout: 10) {
                leave.tap()
                pause(2)
                picture(app, "14-leaving")
                let named = app.buttons["leave-yes"].firstMatch
                let yes = named.exists ? named : app.buttons["Встать из-за стола"].firstMatch
                if yes.waitForExistence(timeout: 10) { yes.tap() }
            }
        }
        XCTAssertTrue(app.buttons["sit"].firstMatch.waitForExistence(timeout: 20), "leaving the table shows the link screen")
        let kept = app.descendants(matching: .any).matching(identifier: "link").firstMatch
        XCTAssertEqual(kept.value as? String, link, "the link of the table that was left stays in the field")
        picture(app, "15-the-link-is-kept")
    }

    /// Every kind of ask, a lost socket, a page loaded again and a replaced window (see the top of the file).
    @MainActor
    func testEveryKindOfAsk() throws {
        let link = ProcessInfo.processInfo.environment["ASKS_LINK"] ?? ""
        try XCTSkipIf(link.isEmpty, "no table to sit at: TEST_RUNNER_ASKS_LINK is not set")
        let app = XCUIApplication()
        // The second message the pages hand over is lost with the socket; after the fourth the
        // story's page is loaded again.
        app.launchArguments = ["-table", link, "-tour", "1", "-keepSent", "1", "-dropBeforeSend", "2", "-reloadAfter", "4"]
        app.launch()

        // The ask and the count of messages at the last press: the same ask offered again after a
        // lost socket has another count, and is pressed again.
        var pressed = ""
        var pictured = Set<String>()
        var missed = 0
        var ended = false
        for _ in 0..<90 {
            guard let now = until(app, 90, { $0.form == "ended" || ($0.link == "up" && $0.control != "none" && $0.key != pressed) }) else {
                XCTFail("the table stopped: \(mark(app)?.text ?? "no state"), last pressed \(pressed)")
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
                    picture(app, "2\(pictured.count)-after-\(now.control)")
                }
            } else {
                missed += 1
                picture(app, "20-no-control-for-\(now.control)-\(missed)")
                if missed >= 3 {
                    XCTFail("no control answered \(now.text)")
                    break
                }
            }
        }
        XCTAssertTrue(ended, "the run was played to its end: \(mark(app)?.text ?? "no state")")
        picture(app, "30-the-end")

        // The host's own second window takes the seat (ci/replay-host.ts `take-seat`): the shell
        // says so and does not take it back until asked.
        let here = app.buttons["play-here"].firstMatch
        XCTAssertTrue(here.waitForExistence(timeout: 60), "the shell said the game is open elsewhere")
        pause(4)
        XCTAssertEqual(mark(app)?.link, "replaced", "a replaced shell does not ask for the seat again by itself")
        picture(app, "31-open-elsewhere")
        _ = tap(app, here)
        XCTAssertNotNil(until(app, 30) { $0.link == "up" }, "«Играть здесь» took the seat back")
        picture(app, "32-back-here")
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

    @MainActor
    private func mark(_ app: XCUIApplication) -> Mark? {
        let element = app.staticTexts.matching(identifier: "shell-state").firstMatch
        guard element.exists else { return nil }
        let text = element.label
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

    /// Answers the open ask with the control the shell put up for it.
    @MainActor
    private func answer(_ app: XCUIApplication, _ now: Mark) -> Bool {
        let first = { (prefix: String) in app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix)).firstMatch }
        // The keyboard is there only while the human types: left standing after a typed line, it
        // comes up at every later ask and covers the rows of its sheet.
        if ["card", "rows", "chips", "answers", "reaction"].contains(now.control) {
            XCTAssertFalse(app.keyboards.firstMatch.exists, "no keyboard stands over the \(now.control) ask")
        }
        switch now.control {
        case "answers":
            // The second answer on offer: it has a control of its own.
            return tap(app, app.buttons["react-answer-2"].firstMatch)
        case "reaction":
            return tap(app, app.buttons["react-yes"].firstMatch)
        case "question":
            return write(app, app.textFields["sheet-line"], "Tie its hands and ask who sent it")
        case "paused":
            // The pause is lifted from the menu, as a typed /pause would.
            return tap(app, app.buttons["menu"].firstMatch) && tap(app, app.buttons["menu-pause"].firstMatch)
        case "card":
            return tap(app, first("choice-"))
        case "rows":
            return tap(app, first("row-"))
        case "chips":
            return tap(app, first("chip-"))
        default:
            // The human's own words: the dock's line opens a line over the keyboard.
            let line = app.buttons["dock-line"].firstMatch
            let field = app.textFields["type-line"]
            guard reach(app, line), openLine(app, line, field) else { return false }
            field.typeText("I look around\n")
            return true
        }
    }

    /// Taps a control. A sheet may stand over it (what a command answered with): it is drawn down
    /// first, as a thumb would.
    @MainActor
    private func tap(_ app: XCUIApplication, _ element: XCUIElement) -> Bool {
        guard reach(app, element) else { return false }
        element.tap()
        return true
    }

    @MainActor
    private func reach(_ app: XCUIApplication, _ element: XCUIElement) -> Bool {
        guard element.waitForExistence(timeout: 15) else { return false }
        for _ in 0..<3 where !element.isHittable {
            let grabber = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.49))
            grabber.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.99)))
            pause(2)
        }
        return element.exists && element.isHittable
    }

    /// Touches the dock's line and waits for its line and its keyboard. On the iOS 27 simulator the
    /// keyboard does not always come at the first touch: its service fails the app, and the line
    /// closes with the focus it lost. A person touches the line again, and so does the tour, once.
    /// It says so in the log, where the job counts it (ci/tour.sh).
    @MainActor
    private func openLine(_ app: XCUIApplication, _ line: XCUIElement, _ field: XCUIElement) -> Bool {
        for touch in 1...2 {
            if field.exists { field.tap() } else { line.tap() }
            if field.waitForExistence(timeout: 10), app.keyboards.firstMatch.waitForExistence(timeout: 15), field.exists {
                return true
            }
            print("nat20-tour the keyboard did not come at touch \(touch) of the dock's line")
            picture(app, "no-keyboard-at-touch-\(touch)")
            // A line that lost its focus closes; the dock's line is touched again when it has.
            let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: field)
            _ = XCTWaiter().wait(for: [closed], timeout: 15)
        }
        return false
    }

    @MainActor
    private func write(_ app: XCUIApplication, _ field: XCUIElement, _ text: String) -> Bool {
        guard field.waitForExistence(timeout: 15) else { return false }
        pause(1)
        if !app.keyboards.firstMatch.exists { field.tap() }
        pause(1)
        guard app.keyboards.firstMatch.exists else { return false }
        field.typeText(text + "\n")
        return true
    }

    /// The system's accessibility audit of what is on screen. Its findings go to the log, where the
    /// job collects them (ci/tour.sh): they are read by a person, and none of them fails the test.
    @MainActor
    private func audit(_ app: XCUIApplication, _ screen: String) {
        do {
            try app.performAccessibilityAudit { issue in
                print("nat20-audit \(screen): \(issue.compactDescription) \(String(describing: issue.element))")
                return true
            }
            print("nat20-audit \(screen): done")
        } catch {
            print("nat20-audit \(screen): the audit did not run: \(error)")
        }
    }

    private func pause(_ seconds: TimeInterval) {
        Thread.sleep(forTimeInterval: seconds)
    }

    @MainActor
    private func picture(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
