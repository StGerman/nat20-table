// Before a table: the link the run on the Mac prints (`--seat web --seat-lan`), pasted or typed, or
// a recorded run from the bundle. The spike's words here are new and nobody has read them as a player.
import SwiftUI

struct ConnectScreen: View {
    let shell: Shell
    @State private var link = ""
    @State private var wrong = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("ws://…", text: $link, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .lineLimit(1...4)
                    PasteButton(payloadType: String.self) { strings in
                        if let first = strings.first {
                            link = first.trimmingCharacters(in: .whitespacesAndNewlines)
                            wrong = false
                        }
                    }
                } header: {
                    Text("Ссылка стола")
                } footer: {
                    Text(wrong ? "Это не похоже на ссылку стола: она начинается с ws://" : "Её показывает игра на вашем Mac, когда стол готов.")
                }
                Section {
                    Button("Сесть за стол", action: join)
                        .disabled(link.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                Section {
                    Button("Бой во дворе мельницы") {
                        shell.sit(.replay(name: "yard.seat-wire.jsonl", to: nil))
                    }
                    Button("Дорога с обозом") {
                        shell.sit(.replay(name: "the-way-back-ru.seat-wire.jsonl", to: nil))
                    }
                } header: {
                    Text("Записанная игра")
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
