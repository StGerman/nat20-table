// The Mac's window: the three pages as tabs, and under them an ask's answers, the chips and the
// dock. The list of a turn's moves opens as a popover over the dock, where the phone opens a sheet.
import SwiftUI
import WebKit

struct MacRoot: View {
    @Bindable var shell: Shell
    @Environment(\.scenePhase) private var phase
    /// The UI test's dark pictures (`-dark 1`): a Mac's look is the system's, which a test cannot set.
    private let dark = UserDefaults.standard.bool(forKey: "dark")

    var body: some View {
        Group {
            if let table = shell.table {
                MacTable(shell: shell, table: table)
            } else {
                ConnectScreen(shell: shell)
            }
        }
        .frame(minWidth: 440, minHeight: 600)
        .preferredColorScheme(dark ? .dark : nil)
        .onChange(of: phase) { _, now in
            if now == .active { shell.woke() }
        }
    }
}

struct MacTable: View {
    @Bindable var shell: Shell
    let table: Table

    var body: some View {
        let tabs = shell.chrome?.tabs
        let words = shell.words
        VStack(spacing: 0) {
            TabView(selection: $shell.screen) {
                Tab(tabs?.story ?? words.story, systemImage: "book", value: Screen.story) {
                    WebView(table.story.page)
                }
                Tab(tabs?.`where` ?? words.place, systemImage: "map", value: Screen.place) {
                    WebView(table.place.page)
                }
                Tab(tabs?.sheet ?? words.sheet, systemImage: "person.text.rectangle", value: Screen.sheet) {
                    WebView(table.sheet.page)
                }
            }
            // Under the pages, not over them: a window has the room, and nothing shows through.
            VStack(spacing: 0) {
                Answers(shell: shell)
                Chips(shell: shell)
                TypeLine(shell: shell)
                DockBar(shell: shell)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .glassEffect(.regular, in: Capsule())
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                    .popover(item: $shell.opened, arrowEdge: .top) { opened in
                        switch opened {
                        case .moves:
                            MovesSheet(shell: shell).frame(width: 420, height: 480)
                        case .lines(let title, let rows):
                            LinesSheet(title: title, rows: rows).frame(width: 420, height: 360)
                        }
                    }
            }
            .padding(.top, 8)
            // In a wide window the dock keeps to the story column's width, not the screen's.
            .frame(maxWidth: 672)
        }
        .navigationTitle(title)
        .navigationSubtitle(shell.chrome?.pill?.text ?? "")
        .onChange(of: shell.screen) { _, now in
            if now == .sheet { shell.freshSheet() }
            // An ask that is its own list waited while another tab was read.
            if now == .story { shell.offer() }
        }
        .overlay(alignment: .topLeading) { StateMark(shell: shell) }
    }

    private var title: String {
        let title = shell.chrome?.title ?? ""
        return title.isEmpty ? Shell.appName : title
    }
}
