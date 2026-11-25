// The Mac's window. A wide one is an open book (CON-25): the story on the left page with an ask's
// answers, the chips and the dock under it, and on the right page the picture of the place
// (CON-26), «Где все» or «Лист». A narrow one shows one of the three pages at a time over the same
// dock, turned by the switch in its title bar. The list of a turn's moves opens as a popover over
// the dock, where the phone opens a sheet.
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
    /// The pages the right page of the open book turns between.
    enum Right: Hashable {
        case picture, place, sheet
    }

    /// The right page the human turned to. None until they do, and none again when the place
    /// changes or a fight starts or ends: then the page turns by itself (`right`).
    @State private var chosen: Right?
    /// How tall the stack under the story stands now: the story ends above it.
    @State private var under: CGFloat = 0

    /// From this width the window is an open book (Stas, 2026-11-25); under it, one page at a time.
    private static let book: CGFloat = 860
    /// The row over the right page that holds its switch.
    private static let bar: CGFloat = 44

    /// What the right page shows: what the human turned it to, else «Где все» in a fight and the
    /// picture of the place out of one, where the table names a place (CON-26).
    private var right: Right {
        let place = shell.chrome?.place != nil
        if let chosen, chosen != .picture || place { return chosen }
        if shell.chrome?.fight == true { return .place }
        return place ? .picture : .place
    }

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
                // The picture is the shell's own view, not a page: it comes and goes with the turn of
                // the right page, and no web view is made or moved for it.
                if open, right == .picture, let place = shell.chrome?.place {
                    Plate(place: place, words: shell.words)
                        .frame(width: other.width, height: other.height)
                        .offset(x: other.minX, y: other.minY)
                }
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
                    chosen = shell.screen == .sheet ? .sheet : .place
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
        // A fight starts or ends, or the table moves to another place: the right page turns by
        // itself again. The first word of either, when a table is sat down at, turns nothing.
        .onChange(of: shell.chrome?.fight) { was, now in
            if was != nil, now != nil { chosen = nil }
        }
        .onChange(of: shell.chrome?.place?.plate) { was, _ in
            if was != nil { chosen = nil }
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

    /// The switch over the book's right page: the picture of the place where the table names
    /// one, «Где все» and «Лист».
    private var turn: some View {
        let names = shell.chrome?.tabs
        let words = shell.words
        return HStack {
            Picker("", selection: Binding(get: { right }, set: { chosen = $0 })) {
                if shell.chrome?.place != nil {
                    Text(words.picture).tag(Right.picture)
                }
                Text(names?.`where` ?? words.place).tag(Right.place)
                Text(names?.sheet ?? words.sheet).tag(Right.sheet)
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
