// The SwiftUI shell (decision 0093): SwiftUI draws the controls, the page (game/src/page) draws the content.
import SwiftUI

@main
struct GlassTableApp: App {
    var body: some Scene {
        WindowGroup {
            PhoneRoot()
        }
    }
}
