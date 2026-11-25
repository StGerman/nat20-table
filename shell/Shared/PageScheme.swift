// Serves the built page and the recorded runs to the web view from the app bundle, under
// `nat20://page/…`. The web view loads nothing else: no file URLs, no network.
import Foundation
import WebKit

struct PageScheme: URLSchemeHandler {
    static let name = "nat20"
    static let root = "nat20://page/"

    func reply(for request: URLRequest) -> AsyncThrowingStream<URLSchemeTaskResult, any Error> {
        AsyncThrowingStream { continuation in
            guard let url = request.url, let file = Self.file(for: url), let data = try? Data(contentsOf: file) else {
                NSLog("nat20-scheme missing %@", request.url?.absoluteString ?? "?")
                continuation.finish(throwing: URLError(.fileDoesNotExist))
                return
            }
            let headers = [
                "Content-Type": Self.type(of: file.pathExtension),
                "Content-Length": String(data.count),
                "Cache-Control": "no-store",
            ]
            if let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) {
                continuation.yield(.response(response))
                continuation.yield(.data(data))
                continuation.finish()
            } else {
                continuation.finish(throwing: URLError(.badServerResponse))
            }
        }
    }

    /// `/fixtures/<name>` is a recorded run in the bundle; anything else is a file of the page.
    static func file(for url: URL) -> URL? {
        let path = url.path
        let fixtures = "/fixtures/"
        if path.hasPrefix(fixtures) {
            let name = String(path.dropFirst(fixtures.count))
            guard !name.contains("/"), !name.contains("..") else { return nil }
            return Bundle.main.url(forResource: name, withExtension: nil)
        }
        guard let base = Bundle.main.resourceURL?.appendingPathComponent("page", isDirectory: true) else { return nil }
        let relative = path == "/" || path.isEmpty ? "index.html" : String(path.dropFirst())
        guard !relative.contains("..") else { return nil }
        return base.appendingPathComponent(relative)
    }

    static func type(of ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "jsonl": return "application/x-ndjson; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "jpg": return "image/jpeg"
        default: return "application/octet-stream"
        }
    }
}
