// What the controls show, as the page derives it (game/src/page/chrome.ts `Chrome`). The shell
// draws this and decides nothing about the game; a field is added in TypeScript first, then here.
import Foundation

struct Chrome: Codable, Equatable {
    struct Pill: Codable, Equatable {
        var text: String
        var mine: Bool
    }

    struct Me: Codable, Equatable {
        var name: String
        var initial: String
        var hp: Double
        var hpMax: Double
        var low: Bool
        var health: String
        var hpText: String
    }

    struct Move: Codable, Equatable {
        var n: Int
        var id: String
        var label: String
        var cost: String?
        var summary: String?
        var side: String?
    }

    struct Group: Codable, Equatable {
        var title: String?
        var moves: [Move]
    }

    struct ClosedRow: Codable, Equatable {
        var name: String
        var message: String
    }

    struct Closed: Codable, Equatable {
        var title: String
        var rows: [ClosedRow]
    }

    struct Answer: Codable, Equatable {
        var n: Int
        var label: String
    }

    /// With one answer on offer `what` names it and yes takes it; with several, `answers` holds
    /// each, pressed by its number.
    struct Reaction: Codable, Equatable {
        var yes: String
        var no: String
        var what: String?
        var answers: [Answer]?
    }

    struct Sheet: Codable, Equatable {
        var forced: Bool
        var lead: String?
        var question: String?
        var reaction: Reaction?
        var groups: [Group]
        var closed: Closed?
    }

    struct Vote: Codable, Equatable {
        var who: String
        var name: String
        var initial: String
        var mine: Bool
    }

    struct Choice: Codable, Equatable {
        var id: String
        var text: String
        var n: Int?
        var votes: [Vote]
    }

    struct Card: Codable, Equatable {
        var asked: Bool
        var decided: String?
        var choices: [Choice]
        var own: String?
        var fell: String?
    }

    struct Budget: Codable, Equatable {
        var label: String
        var spent: Bool
        var value: Double?
    }

    struct Dock: Codable, Equatable {
        var form: String
        var ask: String?
        var placeholder: String
        var open: Bool
        var refusal: String?
        var spent: [String]
        var chips: [Move]
        var endTurn: Move?
        var more: String?
        var sheet: Sheet?
        var card: Card?
        var budget: [Budget]?
    }

    struct Tabs: Codable, Equatable {
        var story: String
        var `where`: String
        var sheet: String
        var people: String
        var canWhere: Bool
    }

    var seq: Int
    var language: String
    var title: String
    var `where`: String?
    var pill: Pill?
    var me: Me?
    var dock: Dock
    var tabs: Tabs
    var stage: Bool
    var sheetStale: Bool
}
