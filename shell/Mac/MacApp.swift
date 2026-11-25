// The shell on the Mac (CON-23, decision 0093): one window around the same pages, and the dock's
// actions in the menu bar, each with a key. The shell's model and controls are the phone's (Shared).
import AppKit
import SwiftUI

@main
struct MacApp: App {
    @NSApplicationDelegateAdaptor(Closing.self) private var closing
    // One shell for the app: a second one would load every page twice.
    @State private var shell = Shell.shared

    var body: some Scene {
        Window(Shell.appName, id: "table") {
            MacRoot(shell: shell)
        }
        .defaultSize(width: 560, height: 880)
        .commands {
            // Read here, so the menu is built again whenever what it offers changes.
            TableCommands(shell: shell, menu: shell.menu)
        }
    }
}

/// Closing the window ends the app, and at a live table the run: the host is told `quit` first, so
/// it saves the party before it stops (Glass Table design §7). The phone only leaves; the Mac is
/// where the run ends. A host that cannot be told (its socket stays down, the page is gone) does
/// not keep the app open: the run goes on there, and the same link sits down at it again.
@MainActor
final class Closing: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        let shell = Shell.shared
        guard shell.live, shell.link != .replaced else { return .terminateNow }
        Task { @MainActor in
            _ = await shell.quit()
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}

/// The game's menu: every answer the open ask takes, the whole list, the human's own words, the
/// pause. Each command does what its control in the window does, through the page.
struct TableCommands: Commands {
    let shell: Shell
    let menu: Shell.MenuState

    var body: some Commands {
        // In the Mac's language, as the menus beside it are: a menu's name in the bar is set once
        // and does not follow the table's. Its commands are the table's words.
        CommandMenu(Words.of(nil).game) {
            ForEach(Array(menu.moves.enumerated()), id: \.element.id) { at, move in
                Button(move.label) { shell.press(move.n) }
                    .keyboardShortcut(Self.key(at))
            }
            if let yes = menu.yes {
                Button(yes) { shell.react(true) }
                    .keyboardShortcut("y", modifiers: .command)
            }
            if let no = menu.no {
                Button(no) { shell.react(false) }
                    .keyboardShortcut("n", modifiers: .command)
            }
            Divider()
            if let list = menu.list {
                Button(list) { shell.opened = .moves }
                    .keyboardShortcut("l", modifiers: .command)
            }
            if let line = menu.line {
                Button(line) { shell.write() }
                    .keyboardShortcut("k", modifiers: .command)
            }
            Divider()
            Button(menu.pause) { shell.pause() }
                .keyboardShortcut("p", modifiers: .command)
                .disabled(!menu.table)
            if let leave = menu.leave {
                Button(leave) { shell.leave() }
            }
            if let playHere = menu.playHere {
                Button(playHere) { shell.playHere() }
                    .keyboardShortcut(.return, modifiers: .command)
            }
        }
    }

    /// The first nine answers take the keys 1 to 9, by their place in the menu.
    private static func key(_ at: Int) -> KeyboardShortcut? {
        guard at < 9, let digit = String(at + 1).first else { return nil }
        return KeyboardShortcut(KeyEquivalent(digit), modifiers: .command)
    }
}
