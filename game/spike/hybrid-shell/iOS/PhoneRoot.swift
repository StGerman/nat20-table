// The iPhone layout: a tab bar, the dock as its accessory, and the page's content under both.
import SwiftUI
import WebKit

struct PhoneRoot: View {
    // One shell for the app: a second one would load every page twice.
    private let shell = Shell.shared

    var body: some View {
        if let table = shell.table {
            Tabs(shell: shell, table: table)
        } else {
            ConnectScreen(shell: shell)
        }
    }
}

struct Tabs: View {
    @Bindable var shell: Shell
    let table: Table

    var body: some View {
        let tabs = shell.chrome?.tabs
        let stage = shell.chrome?.stage == true
        TabView(selection: $shell.screen) {
            Tab(tabs?.story ?? "Рассказ", systemImage: "book", value: Screen.story) {
                ContentScreen(shell: shell, content: table.story)
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        Chips(shell: shell)
                    }
            }
            Tab(tabs?.`where` ?? "Где все", systemImage: "map", value: Screen.place) {
                ContentScreen(shell: shell, content: table.place)
            }
            Tab(tabs?.sheet ?? "Лист", systemImage: "person.text.rectangle", value: Screen.sheet) {
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
        .onChange(of: shell.screen) { _, now in
            if now == .sheet { shell.freshSheet() }
        }
        .sheet(item: $shell.opened) { opened in
            switch opened {
            case .moves:
                MovesSheet(shell: shell)
            case .lines(let title, let rows):
                LinesSheet(title: title, rows: rows)
            }
        }
    }
}

/// One tab's content under the title: the page, edge to edge, scrolling under the bars.
struct ContentScreen: View {
    let shell: Shell
    let content: Content
    private let edge = UserDefaults.standard.bool(forKey: "edge")

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
                        Button(shell.chrome?.dock.form == "paused" ? "Продолжить игру" : "Пауза") {
                            shell.pause()
                        }
                        .accessibilityIdentifier("menu-pause")
                        Button("Встать из-за стола", role: .destructive) {
                            shell.leave()
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
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
        }
    }

    private var title: String {
        let title = shell.chrome?.title ?? ""
        return title.isEmpty ? Shell.appName : title
    }
}
