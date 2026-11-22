// The dock and its sheet, drawn from the chrome state: the capsule the human types in, the chips
// of a turn, and the sheet with every move, a road card, a reaction or the Narrator's question.
import SwiftUI

/// The capsule: health, the line the human types, and the way to the whole list.
struct DockBar: View {
    let shell: Shell
    @State private var draft = ""
    @FocusState private var typing: Bool

    var body: some View {
        if !shell.online {
            // The socket to the table is down: the shell keeps asking for it.
            HStack(spacing: 10) {
                Text("Нет связи со столом").foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: 0)
                ProgressView()
            }
            .padding(.horizontal, 14)
        } else if let chrome = shell.chrome {
            let dock = chrome.dock
            HStack(spacing: 10) {
                if let me = chrome.me {
                    HealthBadge(me: me)
                }
                if dock.form == "waiting" || dock.form == "ended" || !dock.open {
                    Text(dock.placeholder)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if dock.form == "waiting" {
                        ProgressView()
                    }
                } else {
                    TextField(dock.placeholder, text: $draft)
                        .accessibilityIdentifier("dock-line")
                        .focused($typing)
                        .submitLabel(.send)
                        .onSubmit(submit)
                    if !draft.isEmpty {
                        Button(action: submit) {
                            Image(systemName: "arrow.up.circle.fill").font(.title2)
                        }
                    } else if dock.sheet != nil || dock.card != nil {
                        Button {
                            shell.opened = .moves
                        } label: {
                            Image(systemName: "list.bullet").font(.title3)
                        }
                        .accessibilityLabel(dock.more ?? dock.placeholder)
                        .accessibilityIdentifier("dock-list")
                    }
                }
            }
            .padding(.horizontal, 14)
        } else {
            ProgressView()
        }
    }

    private func submit() {
        let text = draft
        shell.typed(text) { ok in
            if ok { draft = "" }
        }
    }
}

struct HealthBadge: View {
    let me: Chrome.Me

    var body: some View {
        HStack(spacing: 6) {
            Text(me.initial)
                .font(.footnote.weight(.semibold))
                .frame(width: 26, height: 26)
                .background(Circle().fill(.quaternary))
            VStack(alignment: .leading, spacing: 2) {
                Text(me.hpText)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(me.low ? Color.red : Color.primary)
                ProgressView(value: max(0, min(me.hp, me.hpMax)), total: max(1, me.hpMax))
                    .tint(me.low ? .red : .green)
                    .frame(width: 44)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(me.health): \(me.hpText)")
    }
}

/// The few moves of a turn, over the story and above the dock.
struct Chips: View {
    let shell: Shell

    var body: some View {
        if let dock = shell.chrome?.dock, !dock.chips.isEmpty || dock.endTurn != nil || dock.refusal != nil || shell.notice != nil {
            VStack(alignment: .leading, spacing: 6) {
                if let words = shell.notice ?? dock.refusal {
                    Text(words)
                        .font(.footnote)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 14))
                }
                ForEach(dock.spent, id: \.self) { line in
                    Text(line).font(.caption).foregroundStyle(.secondary)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(dock.chips, id: \.n) { move in
                            chip(move)
                        }
                        if let end = dock.endTurn {
                            chip(end)
                        }
                        if let more = dock.more {
                            Button {
                                shell.opened = .moves
                            } label: {
                                Text(more).font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 14)
                                    .frame(minHeight: 44)
                                    .glassEffect(.regular.interactive(), in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 8)
        }
    }

    private func chip(_ move: Chrome.Move) -> some View {
        Button {
            shell.press(move.n)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                Text(move.label).font(.subheadline.weight(.semibold)).lineLimit(1)
                if let cost = move.cost {
                    Text(cost).font(.caption2).foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .glassEffect(.regular.interactive(), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("chip-\(move.n)")
    }
}

/// The sheet of the open ask.
struct MovesSheet: View {
    let shell: Shell
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            List {
                if let dock = shell.chrome?.dock {
                    if let card = dock.card {
                        Section {
                            ForEach(card.choices, id: \.id) { choice in
                                Button {
                                    if let n = choice.n { shell.press(n) }
                                } label: {
                                    HStack(alignment: .top) {
                                        Text(choice.text)
                                            .fontWeight(card.decided == choice.id ? .bold : .regular)
                                            .foregroundStyle(Color.primary)
                                        Spacer(minLength: 8)
                                        ForEach(choice.votes, id: \.who) { vote in
                                            Text(vote.initial)
                                                .font(.caption.weight(.semibold))
                                                .frame(width: 24, height: 24)
                                                .background(Circle().fill(vote.mine ? AnyShapeStyle(.tint) : AnyShapeStyle(.quaternary)))
                                                .accessibilityLabel(vote.name)
                                        }
                                    }
                                }
                                .disabled(!card.asked || choice.n == nil)
                            }
                        } footer: {
                            VStack(alignment: .leading, spacing: 4) {
                                if let own = card.own { Text(own) }
                                if let fell = card.fell { Text(fell) }
                            }
                        }
                    } else if let sheet = dock.sheet {
                        if let lead = sheet.lead ?? sheet.question {
                            Section { Text(lead) }
                        }
                        if let reaction = sheet.reaction {
                            Section {
                                Button(reaction.yes) { shell.react(true) }.foregroundStyle(Color.primary)
                                Button(reaction.no) { shell.react(false) }.foregroundStyle(Color.primary)
                            }
                        }
                        ForEach(Array(sheet.groups.enumerated()), id: \.offset) { _, group in
                            Section(group.title ?? "") {
                                ForEach(group.moves, id: \.n) { move in
                                    Button {
                                        shell.press(move.n)
                                    } label: {
                                        HStack(alignment: .top) {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(move.label).foregroundStyle(Color.primary)
                                                if let summary = move.summary {
                                                    Text(summary).font(.footnote).foregroundStyle(Color.secondary)
                                                }
                                            }
                                            Spacer(minLength: 8)
                                            if let side = move.side {
                                                Text(side).font(.footnote).foregroundStyle(Color.secondary)
                                            }
                                        }
                                    }
                                    .accessibilityIdentifier("row-\(move.n)")
                                }
                            }
                        }
                        if let closed = sheet.closed {
                            Section(closed.title) {
                                ForEach(closed.rows, id: \.name) { row in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(row.name)
                                        Text(row.message).font(.footnote)
                                    }
                                    .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    // The sheet covers the dock, so the human's own words are typed here.
                    if dock.open {
                        Section {
                            TextField(dock.placeholder, text: $draft)
                                .submitLabel(.send)
                                .onSubmit {
                                    let text = draft
                                    shell.typed(text) { ok in
                                        if ok { draft = "" }
                                    }
                                }
                        }
                    }
                }
            }
            // «Что ещё можно» names the list a turn opens; an ask that is its own list has no name.
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(title.isEmpty ? .hidden : .visible, for: .navigationBar)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
    }

    private var title: String {
        guard let dock = shell.chrome?.dock, dock.card == nil, dock.sheet?.forced != true else { return "" }
        return dock.more ?? ""
    }
}

/// A roll's lines or a person's card, as the page worded them.
struct LinesSheet: View {
    let title: String
    let rows: [String]

    var body: some View {
        NavigationStack {
            List {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    Text(row)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
