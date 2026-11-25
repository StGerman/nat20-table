// The SwiftUI shell on the iPhone (decision 0093): SwiftUI draws the controls, the page
// (game/src/page) draws the content. The Mac's entry is Mac/MacApp.swift.
import SwiftUI

@main
struct GlassTableApp: App {
    var body: some Scene {
        WindowGroup {
            PhoneRoot()
        }
    }
}
