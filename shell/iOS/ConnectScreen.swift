// Before a table: the link the run on the Mac prints (`--seat web --seat-lan`), pasted or typed, or
// a recorded run from the bundle. The link of the table the human last left stays in the field.
import SwiftUI

struct ConnectScreen: View {
    let shell: Shell
    @State private var link = UserDefaults.standard.string(forKey: "lastTable") ?? ""
    @State private var wrong = false

    var body: some View {
        let words = shell.words
        NavigationStack {
            Form {
                Section {
                    TextField("ws://…", text: $link, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .lineLimit(1...4)
                        .accessibilityLabel(words.linkHeader)
                        .accessibilityIdentifier("link")
                    PasteButton(payloadType: String.self) { strings in
                        if let first = strings.first {
                            link = first.trimmingCharacters(in: .whitespacesAndNewlines)
                            wrong = false
                        }
                    }
                } header: {
                    Text(words.linkHeader)
                } footer: {
                    Text(wrong ? words.linkWrong : words.linkFooter)
                }
                Section {
                    Button(words.sit, action: join)
                        .disabled(link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("sit")
                }
                Section {
                    Button(words.yard) {
                        shell.sit(.replay(name: "yard.seat-wire.jsonl", to: nil))
                    }
                    Button(words.road) {
                        shell.sit(.replay(name: "the-way-back-ru.seat-wire.jsonl", to: nil))
                    }
                } header: {
                    Text(words.recorded)
                } footer: {
                    Text(words.recordedFooter)
                }
            }
            .navigationTitle(Shell.appName)
        }
    }

    private func join() {
        let text = link.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: text), url.scheme == "ws" || url.scheme == "wss", url.host != nil else {
            wrong = true
            return
        }
        shell.connect(url, keep: true)
    }
}
