// The Mac's window. A wide one is an open book (CON-25): the story on the left page with an ask's
// answers, the chips and the dock under it, and «Где все» or «Лист» on the right page. A narrow one
// holds the three pages as tabs over the same dock. The list of a turn's moves opens as a popover
// over the dock, where the phone opens a sheet.
import SwiftUI
import WebKit

struct MacRoot: View {
    @Bindable var shell: Shell
    @Environment(\.scenePhase) private var phase
    /// The UI test's dark pictures (`-dark 1`): a Mac's look is the system's, which a test cannot set.
    private let dark = UserDefaults.standard.bool(forKey: "dark")
    /// The UI test's wide window (`-wide 1`): a test cannot drag a window's edge to a size.
    private let wide = UserDefaults.standard.bool(forKey: "wide")

    var body: some View {
        Group {
            if let table = shell.table {
                MacTable(shell: shell, table: table)
            } else {
                ConnectScreen(shell: shell)
            }
        }
        .frame(minWidth: wide ? 1000 : 440, minHeight: 600)
        .preferredColorScheme(dark ? .dark : nil)
        .onChange(of: phase) { _, now in
            if now == .active { shell.woke() }
        }
    }
}

struct MacTable: View {
    @Bindable var shell: Shell
    let table: Table
    /// What the right page of the open book shows: «Где все» or «Лист».
    @State private var right = Screen.place

    /// From this width the window is an open book (Stas, 2026-11-25); under it the pages are tabs.
    private static let book: CGFloat = 860

    var body: some View {
        GeometryReader { window in
            let open = window.size.width >= Self.book
            HStack(spacing: 0) {
                // The dock keeps its place when the window crosses the width: a line being typed
                // stays open (it closes when it leaves the window, Shared/Dock.swift).
                VStack(spacing: 0) {
                    if open {
                        WebView(table.story.page)
                    } else {
                        pages
                    }
                    dock
                }
                .frame(maxWidth: .infinity)
                if open {
                    Divider()
                    rightPage
                        .frame(width: (window.size.width * 0.46).rounded())
                }
            }
            .onChange(of: open, initial: true) { _, now in
                guard now else { return }
                // The tab that was being read goes to the right page: the story is always on the left.
                if shell.screen != .story {
                    right = shell.screen
                    shell.screen = .story
                }
                if right == .sheet { shell.freshSheet() }
            }
        }
        .navigationTitle(title)
        .navigationSubtitle(shell.chrome?.pill?.text ?? "")
        .onChange(of: shell.screen) { _, now in
            if now == .sheet { shell.freshSheet() }
            // An ask that is its own list waited while another tab was read.
            if now == .story { shell.offer() }
        }
        .onChange(of: right) { _, now in
            if now == .sheet { shell.freshSheet() }
        }
        .overlay(alignment: .topLeading) { StateMark(shell: shell) }
    }

    /// A narrow window: the three pages as tabs.
    private var pages: some View {
        let tabs = shell.chrome?.tabs
        let words = shell.words
        return TabView(selection: $shell.screen) {
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
    }

    /// The right page of the open book: one of the two pages that are not the story, and the
    /// switch between them over it. The human turns it; nothing turns it for them.
    private var rightPage: some View {
        let tabs = shell.chrome?.tabs
        let words = shell.words
        return VStack(spacing: 0) {
            Picker("", selection: $right) {
                Text(tabs?.`where` ?? words.place).tag(Screen.place)
                Text(tabs?.sheet ?? words.sheet).tag(Screen.sheet)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
            .padding(.vertical, 8)
            if right == .sheet {
                WebView(table.sheet.page)
            } else {
                WebView(table.place.page)
            }
        }
        // Named for the UI test: it stands only in an open book.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("book-right")
    }

    /// Under the story, not over it: a window has the room, and nothing shows through.
    private var dock: some View {
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

    private var title: String {
        let title = shell.chrome?.title ?? ""
        return title.isEmpty ? Shell.appName : title
    }
}
