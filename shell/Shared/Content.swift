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
    /// The last event this page says it has: a socket that comes back asks from the least of the three.
    var seq = 0
    private let show: String
    private let address: URL?
    private weak var shell: Shell?
    private var bridge: Bridge?
    /// The host's lines the page has not been given yet: it takes them once it says it is ready, in order.
    private var waiting: [String] = []
    private var ready = false
    private var pumping = false
    /// The page is being loaded again (`recover`), and when it last was.
    private var recovering = false
    /// The window is an open book (`book`): said again to a page that was loaded again.
    private var asBook = false
    private var recovered: Date?

    /// `main` is the story's page: the one whose word on the controls the shell draws.
    init(show: String, source: Source, main: Bool, shell: Shell) {
        self.show = show
        self.shell = shell
        var address = "\(PageScheme.root)index.html?shell=native&show=\(show)"
        if case .replay(let name, let to) = source {
            address += "&replay=/fixtures/\(name)&language=ru&handle=bren&names=bren:%D0%91%D1%80%D0%B5%D0%BD,torva:%D0%A2%D0%BE%D1%80%D0%B2%D0%B0,maren:%D0%9C%D0%B0%D1%80%D0%B5%D0%BD,ilsa:%D0%98%D0%BB%D1%8C%D0%B7%D0%B0"
            if let to { address += "&to=\(to)" }
        }
        self.address = URL(string: address)
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
        if let url = self.address {
            page.load(URLRequest(url: url))
        } else {
            say("nat20-diag bad address \(address)")
        }
        Task { await self.report() }
    }

    /// Loads the page again: the system ended its process, or it stopped answering. It comes back
    /// empty and says it is ready, and the shell then has the host tell the run from the start.
    func recover() {
        // Once in a while: a page that breaks on the same line every time is not loaded in a loop.
        if let last = recovered, Date().timeIntervalSince(last) < 30 { return }
        guard let address, !recovering else { return }
        say("nat20-diag \(show) is loaded again")
        recovering = true
        recovered = Date()
        ready = false
        waiting.removeAll()
        page.load(URLRequest(url: address))
    }

    /// The app is on screen again: a page whose process the system ended while it was away is found now.
    func check() {
        guard ready else { return }
        Task {
            let alive = (try? await page.callJavaScript("return !!window.__nat20Shell")) as? Bool
            if alive != true, ready { recover() }
        }
    }

    /// A line from the host, as it came off the socket.
    func host(_ line: String) {
        waiting.append(line)
        pump()
    }

    /// Something of the shell's came to stand over the story's last lines (the line the human
    /// types in, and the keyboard under it): the story is shown from its end again. The page was
    /// at its end for a shorter screen, and nothing tells it the screen grew shorter. Asked for
    /// more than once: the keyboard takes its time to come up.
    func toEnd() {
        Task {
            for wait in [150, 300, 500] {
                try? await Task.sleep(for: .milliseconds(wait))
                _ = try? await page.callJavaScript("scrollTo({ top: document.documentElement.scrollHeight })")
            }
        }
    }

    /// The shell's sheet stands over the lower half of the page, or no longer does.
    func under(_ on: Bool) {
        Task {
            _ = try? await page.callJavaScript("if (window.__nat20Shell) window.__nat20Shell.under(on)", arguments: ["on": on])
        }
    }

    /// The window is an open book, with the picture of the place on its right page, or is not:
    /// in a book the story keeps the place's name and does not draw the picture a second time.
    func book(_ on: Bool) {
        asBook = on
        Task {
            _ = try? await page.callJavaScript("if (window.__nat20Shell && window.__nat20Shell.book) window.__nat20Shell.book(on)", arguments: ["on": on])
        }
    }

    /// The page can take the host's lines now. A page that says so a second time was loaded again
    /// and holds nothing: what it was given before is gone with it.
    func isReady() {
        let again = ready || recovering
        ready = true
        recovering = false
        if asBook { book(true) }
        if again {
            seq = 0
            waiting.removeAll()
            shell?.cameBack()
        } else {
            pump()
        }
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
                    // The lines are lost with the page: loaded again, it is told the run from the start.
                    say("nat20-diag \(show) did not take \(lines.count) lines: \(error)")
                    pumping = false
                    if ready { recover() }
                    return
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
            // The page did not answer: it is loaded again, and the press was not taken.
            say("nat20-diag act failed: \(error)")
            if ready { recover() }
            return (false, nil)
        }
    }

    /// A few lines in the log on what the page drew, for the pictures job to read back.
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
