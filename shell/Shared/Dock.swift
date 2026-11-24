// The dock and its sheet, drawn from the chrome state: the capsule the human types in, the chips
// of a turn, and the sheet with every move, a road card, a reaction or the Narrator's question.
import SwiftUI

/// The capsule: health, the line the human types, and the way to the whole list.
struct DockBar: View {
    let shell: Shell

    var body: some View {
        let words = shell.words
        if shell.link == .down {
            // The socket to the table is down: the shell keeps asking for it, and says nothing is lost.
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(words.offline).font(.footnote.weight(.semibold)).lineLimit(1)
                    Text(words.offlineMore).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("offline")
                Spacer(minLength: 0)
                ProgressView()
            }
            .padding(.horizontal, 14)
        } else if shell.link == .replaced {
            // Another window took the seat: this one asks for it only when the human says so.
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    // The line is longer than the room beside the button: it is set smaller, not cut.
                    Text(words.elsewhere).font(.footnote.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.75)
                    Text(words.elsewhereMore).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                .accessibilityElement(children: .combine)
                Spacer(minLength: 0)
                Button(words.playHere) { shell.playHere() }
                    .font(.footnote.weight(.semibold))
                    .accessibilityIdentifier("play-here")
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
                        ProgressView().accessibilityHidden(true)
                    }
                } else {
                    // The keyboard would cover a line typed here, so a touch opens the line over the
                    // keyboard (TypeLine) and this one only shows what it holds.
                    Button {
                        shell.screen = .story
                        shell.typing = true
                    } label: {
                        Text(shell.draft.isEmpty ? dock.placeholder : shell.draft)
                            .foregroundStyle(shell.draft.isEmpty ? Color.secondary : Color.primary)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("dock-line")
                    if dock.sheet != nil || dock.card != nil {
                        Button {
                            shell.opened = .moves
                        } label: {
                            // A finger's width, whatever the picture's size.
                            Image(systemName: "list.bullet").font(.title3)
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
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
}

/// The line the human types in, over the keyboard: the dock sits under the keyboard, so its own
/// line could not be read while typing.
struct TypeLine: View {
    @Bindable var shell: Shell
    @FocusState private var focused: Bool

    var body: some View {
        if shell.typing, let dock = shell.chrome?.dock, dock.open {
            HStack(spacing: 8) {
                TextField(dock.placeholder, text: $shell.draft)
                    .accessibilityIdentifier("type-line")
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit(submit)
                Button(action: submit) {
                    Image(systemName: "arrow.up.circle.fill").font(.title2)
                }
                .disabled(shell.draft.isEmpty)
                .accessibilityLabel(shell.words.send)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .glassEffect(.regular, in: Capsule())
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .task { focused = true }
            .onChange(of: focused) { _, now in
                // The keyboard went: the line goes with it, and the dock shows what is left unsent.
                if !now { shell.typing = false }
            }
            // The dock closed under the line (the answer was taken, the table moved on) before the
            // lost focus was seen: the line must not come back, keyboard and all, at the next ask.
            .onDisappear { shell.typing = false }
        }
    }

    private func submit() {
        let text = shell.draft
        shell.typed(text) { ok in
            if ok { shell.draft = "" }
        }
        focused = false
        shell.typing = false
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
                    note(words)
                }
                // Which moves are spent and why. The line is long: three rows of it, and the list's
                // own sheet names each move with its reason.
                ForEach(dock.spent, id: \.self) { line in
                    note(line).lineLimit(3)
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

    /// A line of the shell's over the story stands on glass and inside the screen's edges: bare, the
    /// story's own lines show through it and the two cannot be read.
    private func note(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 16)
    }

    private func chip(_ move: Chrome.Move) -> some View {
        Button {
            shell.press(move.n)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                Text(move.label).font(.subheadline.weight(.semibold)).lineLimit(1)
                if let cost = move.cost {
                    // In the label's own colour: the grey of a second line is too faint on glass.
                    Text(cost).font(.caption2)
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
    @Bindable var shell: Shell

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
                                    // The votes read after the choice: each is a name.
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
                                .accessibilityIdentifier("choice-\(choice.n ?? 0)")
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
                                if let answers = reaction.answers, !answers.isEmpty {
                                    // Several answers on offer: each is pressed by its number, as a move is.
                                    ForEach(answers, id: \.n) { answer in
                                        Button(answer.label) { shell.press(answer.n) }
                                            .foregroundStyle(Color.primary)
                                            .accessibilityIdentifier("react-answer-\(answer.n)")
                                    }
                                } else {
                                    Button {
                                        shell.react(true)
                                    } label: {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(reaction.yes).foregroundStyle(Color.primary)
                                            if let what = reaction.what {
                                                Text(what).font(.footnote).foregroundStyle(Color.secondary)
                                            }
                                        }
                                    }
                                    .accessibilityIdentifier("react-yes")
                                }
                                Button(reaction.no) { shell.react(false) }.foregroundStyle(Color.primary).accessibilityIdentifier("react-no")
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
                    // The sheet covers the dock, so the human's own words are typed here: the same
                    // line as the dock's, and why the page would not take it is said under it.
                    if dock.open {
                        Section {
                            TextField(dock.placeholder, text: $shell.draft)
                                .accessibilityIdentifier("sheet-line")
                                .submitLabel(.send)
                                .onSubmit {
                                    let text = shell.draft
                                    shell.typed(text) { ok in
                                        if ok { shell.draft = "" }
                                    }
                                }
                        } footer: {
                            if let notice = shell.notice { Text(notice) }
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
        .overlay(alignment: .topLeading) { StateMark(shell: shell) }
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

/// What stands now, in one line a UI test reads (`-tour 1`); nothing is drawn without the flag.
struct StateMark: View {
    let shell: Shell

    var body: some View {
        if shell.tour {
            Text(shell.mark)
                .font(.system(size: 4))
                .foregroundStyle(Color.clear)
                .lineLimit(1)
                .accessibilityIdentifier("shell-state")
                .allowsHitTesting(false)
        }
    }
}
