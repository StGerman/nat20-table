// A finger's tour of a live table, for the spike's recording: the app sits at the replay host
// (ci/replay-host.ts) by its link, presses a move, opens the list and picks from it, types a line,
// scrolls the story and visits the other tabs. It checks little: the video and the pictures it
// leaves are what gets read.
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

        // The human's own words, typed in the dock.
        let line = app.textFields["dock-line"]
        if line.waitForExistence(timeout: 20) {
            line.tap()
            pause(1)
            picture(app, "06-the-keyboard")
            line.typeText("I look around\n")
            pause(4)
            picture(app, "07-after-typing")
        }

        // The story under the bars: scrolled back, the tab bar steps aside; scrolled on, it returns.
        app.swipeDown()
        pause(1)
        picture(app, "08-scrolled-back")
        app.swipeUp()
        pause(1)
        picture(app, "09-scrolled-on")

        // The other tabs.
        for (index, name) in ["10-where", "11-sheet", "12-story-again"].enumerated() {
            let tab = app.tabBars.buttons.element(boundBy: (index + 1) % 3)
            if tab.waitForExistence(timeout: 10) {
                tab.tap()
                pause(3)
            }
            picture(app, name)
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
