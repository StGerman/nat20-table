// The Mac's window. A wide one is an open book (CON-25): the story on the left page with an ask's
// answers, the chips and the dock under it, and «Где все» or «Лист» on the right page. A narrow one
// shows one of the three pages at a time over the same dock, turned by the switch in its title bar.
// The list of a turn's moves opens as a popover over the dock, where the phone opens a sheet.
import SwiftUI
import WebKit

struct MacRoot: View {
    @Bindable var shell: Shell
    @Environment(\.scenePhase) private var phase
    /// The UI test's dark pictures (`-dark 1`): a Mac's look is the system's, which a test cannot set.
    private let dark = UserDefaults.standard.bool(forKey: "dark")
    /// The UI test's wide window: a test cannot drag a window's edge to a size. `-wide 1` opens it
    /// at least 1000 points wide; `-widen <seconds>` opens it as it would be and makes it that wide
    /// after the seconds, with the table open in it.
    @State private var wide = UserDefaults.standard.bool(forKey: "wide")
    private let widen = UserDefaults.standard.integer(forKey: "widen")

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
        .task {
            guard widen > 0 else { return }
            try? await Task.sleep(for: .seconds(widen))
            wide = true
        }
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
    /// How tall the stack under the story stands now: the story ends above it.
    @State private var under: CGFloat = 0

    /// From this width the window is an open book (Stas, 2026-11-25); under it, one page at a time.
    private static let book: CGFloat = 860
    /// The row over the right page that holds its switch.
    private static let bar: CGFloat = 44

    var body: some View {
        GeometryReader { window in
            let size = window.size
            let open = size.width >= Self.book
            let side = open ? (size.width * 0.46).rounded() : 0
            let left = size.width - side
            let story = CGRect(x: 0, y: 0, width: left, height: max(0, size.height - under))
            // A page that is not the story: the book's right page, or the story's place in a narrow window.
            let other = open ? CGRect(x: left + 1, y: Self.bar, width: max(0, side - 1), height: max(0, size.height - Self.bar)) : story
            // The three web views are made once and stay where they are in this stack whatever the
            // window does: only their frames change. A page cannot be in two web views at once, and
            // a layout that draws the pages anew on its other branch makes the second before the
            // first is gone (the window stopped on that at launch, Stas's Mac, 2026-11-25).
            ZStack(alignment: .topLeading) {
                page(table.story.page, at: story, shown: open || shell.screen == .story)
                page(table.place.page, at: other, shown: open ? right == .place : shell.screen == .place)
                page(table.sheet.page, at: other, shown: open ? right == .sheet : shell.screen == .sheet)
                if open {
                    Rectangle()
                        .fill(.separator)
                        .frame(width: 1, height: size.height)
                        .offset(x: left)
                    turn
                        .frame(width: max(0, side - 1), height: Self.bar)
                        .offset(x: left + 1)
                }
                // The dock keeps its place too: a line being typed closes when it leaves the window.
                dock
                    .frame(width: left)
                    .onGeometryChange(for: CGFloat.self) { proxy in
                        proxy.size.height
                    } action: { height in
                        under = height
                    }
                    .offset(y: size.height - under)
            }
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .toolbar {
                if !open {
                    ToolbarItem(placement: .principal) { tabs }
                }
            }
            .onChange(of: open, initial: true) { _, now in
                guard now else { return }
                // The page that was being read goes to the right page: the story is always on the left.
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
            // An ask that is its own list waited while another page was read.
            if now == .story { shell.offer() }
        }
        .onChange(of: right) { _, now in
            if now == .sheet { shell.freshSheet() }
        }
        .overlay(alignment: .topLeading) { StateMark(shell: shell) }
    }

    /// One page's web view at its place. A page that is not shown keeps its size, so it is not
    /// laid out again and keeps its scroll, and stands off the window, where nothing reaches it.
    private func page(_ page: WebPage, at frame: CGRect, shown: Bool) -> some View {
        WebView(page)
            .frame(width: frame.width, height: frame.height)
            .offset(x: shown ? frame.minX : -(frame.width + 4000), y: frame.minY)
            .opacity(shown ? 1 : 0)
            .allowsHitTesting(shown)
            .accessibilityHidden(!shown)
    }

    /// A narrow window's switch between its three pages, in the title bar.
    private var tabs: some View {
        let names = shell.chrome?.tabs
        let words = shell.words
        return Picker("", selection: $shell.screen) {
            Text(names?.story ?? words.story).tag(Screen.story)
            Text(names?.`where` ?? words.place).tag(Screen.place)
            Text(names?.sheet ?? words.sheet).tag(Screen.sheet)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .fixedSize()
    }

    /// The switch over the book's right page. The human turns it; nothing turns it for them.
    private var turn: some View {
        let names = shell.chrome?.tabs
        let words = shell.words
        return HStack {
            Picker("", selection: $right) {
                Text(names?.`where` ?? words.place).tag(Screen.place)
                Text(names?.sheet ?? words.sheet).tag(Screen.sheet)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
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
