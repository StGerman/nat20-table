// The iPhone layout: a tab bar, the dock as its accessory, the story as web content under both.
import SwiftUI
import WebKit

enum Screen: Hashable {
    case story, place, sheet
}

struct PhoneRoot: View {
    @State private var screen: Screen = .story
    @State private var story = Content(replay: UserDefaults.standard.string(forKey: "replay") ?? "yard.seat-wire.jsonl")
    private let edge = UserDefaults.standard.bool(forKey: "edge")

    var body: some View {
        TabView(selection: $screen) {
            Tab("Рассказ", systemImage: "book", value: Screen.story) {
                NavigationStack {
                    Group {
                        if edge {
                            WebView(story.page).ignoresSafeArea()
                        } else {
                            WebView(story.page)
                        }
                    }
                    .navigationTitle("Тихая мельница")
                    .navigationBarTitleDisplayMode(.inline)
                }
            }
            Tab("Где все", systemImage: "map", value: Screen.place) {
                Text("Где все")
            }
            Tab("Лист", systemImage: "person.text.rectangle", value: Screen.sheet) {
                Text("Лист")
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tabViewBottomAccessory {
            DockStub()
        }
    }
}

/// The dock's place, until the reducer drives it.
struct DockStub: View {
    var body: some View {
        HStack {
            Text("Что делает ваш герой?")
                .foregroundStyle(.secondary)
            Spacer()
            Image(systemName: "arrow.up.circle.fill")
                .font(.title2)
        }
        .padding(.horizontal, 16)
    }
}
