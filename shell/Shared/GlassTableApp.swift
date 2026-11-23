// The hybrid shell spike: SwiftUI draws the controls, the page (game/src/page) draws the content.
import SwiftUI

@main
struct GlassTableApp: App {
    var body: some Scene {
        WindowGroup {
            PhoneRoot()
        }
    }
}
