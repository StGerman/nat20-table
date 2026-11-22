// One web view's content: the page with `shell=native`, loaded from the bundle. It draws content
// only (the story, «Где все» or «Лист»); the story's page also tells the shell what its controls show.
import Foundation
import SwiftUI
import WebKit

/// Where a table's lines come from: a recorded run in the bundle, or the shell's socket.
enum Source {
    case replay(name: String, to: String?)
    case live
}

@MainActor
final class Content {
    let page: WebPage
    private let show: String
    private var bridge: Bridge?
    /// The host's lines the page has not been given yet: it takes them once it says it is ready, in order.
    private var waiting: [String] = []
    private var ready = false
    private var pumping = false

    /// `main` is the story's page: the one whose word on the controls the shell draws.
    init(show: String, source: Source, main: Bool, shell: Shell) {
        self.show = show
        var configuration = WebPage.Configuration()
        if let scheme = URLScheme(PageScheme.name) {
            configuration.urlSchemeHandlers[scheme] = PageScheme()
        } else {
            say("nat20-diag the scheme was refused")
        }
        // What went wrong inside the page, kept for `report`.
        let catcher = """
        window.__err = [];
        window.addEventListener('error', (e) => window.__err.push(String(e.message)));
        window.addEventListener('unhandledrejection', (e) => window.__err.push('rejected: ' + String(e.reason)));
        """
        configuration.userContentController.addUserScript(WKUserScript(source: catcher, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let bridge = Bridge(shell: shell, main: main)
        configuration.userContentController.add(bridge, name: "shell")
        self.bridge = bridge
        page = WebPage(configuration: configuration)
        bridge.content = self
        var address = "\(PageScheme.root)index.html?shell=native&show=\(show)"
        if case .replay(let name, let to) = source {
            address += "&replay=/fixtures/\(name)&language=ru&handle=bren&names=bren:%D0%91%D1%80%D0%B5%D0%BD,torva:%D0%A2%D0%BE%D1%80%D0%B2%D0%B0,maren:%D0%9C%D0%B0%D1%80%D0%B5%D0%BD,ilsa:%D0%98%D0%BB%D1%8C%D0%B7%D0%B0"
            if let to { address += "&to=\(to)" }
        }
        if let url = URL(string: address) {
            page.load(URLRequest(url: url))
        } else {
            say("nat20-diag bad address \(address)")
        }
        Task { await self.report() }
    }

    /// A line from the host, as it came off the socket.
    func host(_ line: String) {
        waiting.append(line)
        pump()
    }

    /// The page can take the host's lines now.
    func isReady() {
        ready = true
        pump()
    }

    private func pump() {
        guard ready, !pumping, !waiting.isEmpty else { return }
        pumping = true
        Task {
            while !waiting.isEmpty {
                let lines = waiting
                waiting.removeAll()
                do {
                    _ = try await page.callJavaScript("for (const line of lines) window.__nat20Shell.host(line)", arguments: ["lines": lines])
                } catch {
                    say("nat20-diag \(show) did not take \(lines.count) lines: \(error)")
                }
            }
            pumping = false
        }
    }

    /// What the human did on a control, handed to the page, which reads it as its own dock would.
    func act(_ what: [String: Any]) async -> (ok: Bool, notice: String?) {
        do {
            let result = try await page.callJavaScript("return window.__nat20Shell ? window.__nat20Shell.act(a) : { ok: false }", arguments: ["a": what])
            let body = result as? [String: Any]
            return ((body?["ok"] as? Bool) ?? false, body?["notice"] as? String)
        } catch {
            say("nat20-diag act failed: \(error)")
            return (false, nil)
        }
    }

    /// A few lines in the log on what the page drew: the spike is built blind, so it says what it sees.
    private func report() async {
        for second in [3, 6, 12] {
            try? await Task.sleep(for: .seconds(second == 12 ? 6 : 3))
            let script = "return JSON.stringify({ text: document.body ? document.body.innerText.length : -1, done: !!(window.__nat20 && window.__nat20.done), height: document.documentElement.scrollHeight, y: window.scrollY, errors: window.__err || null })"
            do {
                let result = try await page.callJavaScript(script)
                say("nat20-diag \(show) t=\(second) \(String(describing: result))")
            } catch {
                say("nat20-diag \(show) t=\(second) failed: \(error)")
            }
        }
    }
}
