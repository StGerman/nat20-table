// An ask that is its own list, on the Mac: a card's choices, a reaction, a question, a pick of rows.
// The phone opens them as a sheet over the story (MovesSheet). A window has the room to stand them
// under the story they ask about, so nothing covers it. Each row does what its row in the sheet
// does, through the page, and carries the same name for a UI test.
import SwiftUI

struct Answers: View {
    let shell: Shell

    var body: some View {
        if shell.ownList, shell.link == .up, let dock = shell.chrome?.dock {
            Group {
                // A few rows stand as they are; a long pick scrolls in a fixed height.
                if count(dock) <= 5 {
                    rows(dock)
                } else {
                    ScrollView { rows(dock) }.frame(height: 260)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
    }

    private func count(_ dock: Chrome.Dock) -> Int {
        if let card = dock.card { return card.choices.count }
        guard let sheet = dock.sheet else { return 0 }
        let answers = sheet.reaction.map { max($0.answers?.count ?? 0, 1) + 1 } ?? 0
        return answers + sheet.groups.reduce(0) { $0 + $1.moves.count } + (sheet.closed?.rows.count ?? 0)
    }

    @ViewBuilder
    private func rows(_ dock: Chrome.Dock) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let card = dock.card {
                ForEach(card.choices, id: \.id) { choice in
                    row("choice-\(choice.n ?? 0)", on: card.asked && choice.n != nil) {
                        if let n = choice.n { shell.press(n) }
                    } label: {
                        Text(choice.text).fontWeight(card.decided == choice.id ? .bold : .regular)
                        Spacer(minLength: 8)
                        // The votes read after the choice: each is a name.
                        ForEach(choice.votes, id: \.who) { vote in
                            Text(vote.initial)
                                .font(.caption.weight(.semibold))
                                .frame(width: 22, height: 22)
                                .background(Circle().fill(vote.mine ? AnyShapeStyle(.tint) : AnyShapeStyle(.quaternary)))
                                .accessibilityLabel(vote.name)
                        }
                    }
                }
                if let own = card.own { note(own) }
                if let fell = card.fell { note(fell) }
            } else if let sheet = dock.sheet {
                if let lead = sheet.lead ?? sheet.question { note(lead) }
                if let reaction = sheet.reaction {
                    if let answers = reaction.answers, !answers.isEmpty {
                        ForEach(answers, id: \.n) { answer in
                            row("react-answer-\(answer.n)") { shell.press(answer.n) } label: { Text(answer.label) }
                        }
                    } else {
                        row("react-yes") { shell.react(true) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(reaction.yes)
                                if let what = reaction.what { Text(what).font(.footnote).foregroundStyle(.secondary) }
                            }
                        }
                    }
                    row("react-no") { shell.react(false) } label: { Text(reaction.no) }
                }
                ForEach(Array(sheet.groups.enumerated()), id: \.offset) { _, group in
                    if let title = group.title, !title.isEmpty { note(title) }
                    ForEach(group.moves, id: \.n) { move in
                        row("row-\(move.n)") { shell.press(move.n) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(move.label)
                                if let summary = move.summary { Text(summary).font(.footnote).foregroundStyle(.secondary) }
                            }
                            Spacer(minLength: 8)
                            if let side = move.side { Text(side).font(.footnote).foregroundStyle(.secondary) }
                        }
                    }
                }
                if let closed = sheet.closed {
                    note(closed.title)
                    ForEach(closed.rows, id: \.name) { row in
                        note("\(row.name): \(row.message)")
                    }
                }
            }
        }
    }

    private func row(_ id: String, on: Bool = true, action: @escaping () -> Void, @ViewBuilder label: () -> some View) -> some View {
        Button(action: action) {
            HStack(alignment: .top) { label() }
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .disabled(!on)
        .accessibilityIdentifier(id)
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 14)
            .fixedSize(horizontal: false, vertical: true)
    }
}
