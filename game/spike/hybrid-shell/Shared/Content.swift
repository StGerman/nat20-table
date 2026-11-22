// One web view's content: the page, loaded from the bundle. In this first slice it replays a
// recorded run with the page's own bars and dock still on; the bridge comes next.
import Foundation
import SwiftUI
import WebKit

@MainActor
final class Content {
    let page: WebPage

    init(replay: String) {
        var configuration = WebPage.Configuration()
        if let scheme = URLScheme(PageScheme.name) {
            configuration.urlSchemeHandlers[scheme] = PageScheme()
        } else {
            NSLog("nat20-diag the scheme was refused")
        }
        // What went wrong inside the page, kept for `report`.
        let catcher = """
        window.__err = [];
        window.addEventListener('error', (e) => window.__err.push(String(e.message)));
        window.addEventListener('unhandledrejection', (e) => window.__err.push('rejected: ' + String(e.reason)));
        """
        configuration.userContentController.addUserScript(WKUserScript(source: catcher, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        page = WebPage(configuration: configuration)
        let address = "\(PageScheme.root)index.html?replay=/fixtures/\(replay)&language=ru&handle=bren"
        if let url = URL(string: address) {
            page.load(URLRequest(url: url))
        }
        Task { await self.report() }
    }

    /// A few lines in the log on what the page drew: the spike is built blind, so it says what it sees.
    private func report() async {
        for second in [3, 6, 12] {
            try? await Task.sleep(for: .seconds(second == 12 ? 6 : 3))
            let script = "return JSON.stringify({ text: document.body ? document.body.innerText.length : -1, done: !!(window.__nat20 && window.__nat20.done), href: location.href, errors: window.__err || null })"
            do {
                let result = try await page.callJavaScript(script)
                NSLog("nat20-diag t=%d %@", second, String(describing: result))
            } catch {
                NSLog("nat20-diag t=%d failed: %@", second, String(describing: error))
            }
        }
    }
}
