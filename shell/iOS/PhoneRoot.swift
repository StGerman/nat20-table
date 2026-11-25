// The iPhone layout: a tab bar, the dock as its accessory, and the page's content under both.
import SwiftUI
import UIKit
import WebKit

struct PhoneRoot: View {
    // One shell for the app: a second one would load every page twice.
    private let shell = Shell.shared
    @Environment(\.scenePhase) private var phase

    var body: some View {
        Group {
            if let table = shell.table {
                Tabs(shell: shell, table: table)
                    // The table waits for the human and the story is read, not touched: at a table
                    // the phone keeps its screen on.
                    .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
                    .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
            } else {
                ConnectScreen(shell: shell)
            }
        }
        .onChange(of: phase) { _, now in
            if now == .active { shell.woke() }
        }
    }
}

struct Tabs: View {
    @Bindable var shell: Shell
    let table: Table

    var body: some View {
        let tabs = shell.chrome?.tabs
        let words = shell.words
        let stage = shell.chrome?.stage == true
        TabView(selection: $shell.screen) {
            Tab(tabs?.story ?? words.story, systemImage: "book", value: Screen.story) {
                ContentScreen(shell: shell, content: table.story)
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        VStack(spacing: 0) {
                            Chips(shell: shell)
                            TypeLine(shell: shell)
                        }
                    }
            }
            Tab(tabs?.`where` ?? words.place, systemImage: "map", value: Screen.place) {
                ContentScreen(shell: shell, content: table.place)
            }
            Tab(tabs?.sheet ?? words.sheet, systemImage: "person.text.rectangle", value: Screen.sheet) {
                ContentScreen(shell: shell, content: table.sheet)
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tabViewBottomAccessory {
            DockBar(shell: shell)
        }
        .toolbar(stage ? .hidden : .automatic, for: .tabBar)
        .animation(.default, value: stage)
        .onChange(of: shell.opened) { _, now in
            table.story.under(now == .moves)
        }
        // The line the human types in comes up over the story's end, and the keyboard under it.
        .onChange(of: shell.typing) { _, now in
            if now { table.story.toEnd() }
        }
        .onChange(of: shell.screen) { _, now in
            if now == .sheet { shell.freshSheet() }
            // An ask that is its own sheet waited while another tab was read.
            if now == .story { shell.offer() }
        }
        .overlay(alignment: .topLeading) { StateMark(shell: shell) }
        .sheet(item: $shell.opened) { opened in
            switch opened {
            case .moves:
                MovesSheet(shell: shell)
            case .lines(let title, let rows):
                LinesSheet(title: title, rows: rows, face: shell.face)
            }
        }
    }
}

/// One tab's content under the title: the page, edge to edge, scrolling under the bars.
struct ContentScreen: View {
    let shell: Shell
    let content: Content
    private let edge = UserDefaults.standard.bool(forKey: "edge")
    @State private var leaving = false

    var body: some View {
        NavigationStack {
            Group {
                if edge {
                    WebView(content.page).ignoresSafeArea()
                } else {
                    WebView(content.page)
                }
            }
            // The story's lines do not show through the title.
            .scrollEdgeEffectStyle(.hard, for: .top)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        // The table's own pause: the other players wait until it is lifted.
                        Button(shell.chrome?.dock.form == "paused" ? shell.words.goOn : shell.words.pause) {
                            shell.pause()
                        }
                        .accessibilityIdentifier("menu-pause")
                        // A live table goes on without the phone, so leaving it is asked about;
                        // a recording is only closed.
                        Button(shell.words.leave, role: .destructive) {
                            if shell.live { leaving = true } else { shell.leave() }
                        }
                        .accessibilityIdentifier("menu-leave")
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel(shell.words.menu)
                    .accessibilityIdentifier("menu")
                }
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text(title).font(.headline).lineLimit(1)
                        if let pill = shell.chrome?.pill {
                            Text(pill.text)
                                .font(.caption)
                                .foregroundStyle(pill.mine ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                                .lineLimit(1)
                        }
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(shell.chrome?.stage == true ? .hidden : .automatic, for: .navigationBar)
            .confirmationDialog(shell.words.leave, isPresented: $leaving, titleVisibility: .visible) {
                Button(shell.words.leave, role: .destructive) { shell.leave() }
                    .accessibilityIdentifier("leave-yes")
                Button(shell.words.stay, role: .cancel) {}
            } message: {
                Text(shell.words.leaveAsk)
            }
        }
    }

    private var title: String {
        let title = shell.chrome?.title ?? ""
        return title.isEmpty ? Shell.appName : title
    }
}
