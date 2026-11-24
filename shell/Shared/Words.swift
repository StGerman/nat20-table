// The shell's own lines: what it says before a table, about the socket, and in its menu. Everything
// else on screen is the page's or the host's and arrives in the chrome state. The lines follow the
// table's language once a table has said it, and the phone's before that.
import Foundation

struct Words {
    /// The connect screen.
    let linkHeader: String
    let linkFooter: String
    /// The same on the Mac, where the game runs beside the window.
    let linkFooterMac: String
    let linkWrong: String
    let sit: String
    let recorded: String
    let recordedFooter: String
    let yard: String
    let road: String
    /// The tabs, until the page names them.
    let story: String
    let place: String
    let sheet: String
    /// The menu.
    let menu: String
    let pause: String
    let goOn: String
    let leave: String
    let leaveAsk: String
    let stay: String
    /// The socket.
    let offline: String
    let offlineMore: String
    let elsewhere: String
    let elsewhereMore: String
    let playHere: String
    /// Controls that are a picture: what VoiceOver reads.
    let send: String
    /// The Mac's menu bar: the menu of the game's commands, and the command that opens the whole list.
    let game: String
    let whole: String

    static let ru = Words(
        linkHeader: "Ссылка на игру",
        linkFooter: "Игра запускается на Mac и, когда всё готово, показывает ссылку. Она начинается с ws://. Вставьте её сюда или попросите того, кто запустил игру, прислать её вам. Телефон и Mac должны быть в одной сети Wi-Fi.",
        linkFooterMac: "Игра запускается на этом Mac и, когда всё готово, показывает ссылку. Она начинается с ws://. Вставьте её сюда.",
        linkWrong: "По этой ссылке игра не открывается. Нужна та, что показывает игра на Mac: она начинается с ws://.",
        sit: "Сесть за стол",
        recorded: "Записанная игра",
        recordedFooter: "Так игра выглядит. Это запись: ваши ответы в ней ничего не меняют.",
        yard: "Бой во дворе мельницы",
        road: "Дорога с обозом",
        story: "Рассказ",
        place: "Где все",
        sheet: "Лист",
        menu: "Меню",
        pause: "Пауза",
        goOn: "Продолжить игру",
        leave: "Встать из-за стола",
        leaveAsk: "Остальные доиграют свои ходы, а ваш ход будет вас ждать. Ничего из сыгранного не пропадёт: по той же ссылке вы вернётесь туда, где остановились.",
        stay: "Остаться",
        offline: "Нет связи с игрой",
        offlineMore: "Ничего не потеряно. Подключаюсь снова.",
        elsewhere: "Игра открыта на другом устройстве",
        elsewhereMore: "Ничего не потеряно.",
        playHere: "Играть здесь",
        send: "Отправить",
        game: "Игра",
        whole: "Весь список"
    )

    static let en = Words(
        linkHeader: "Game link",
        linkFooter: "The game starts on a Mac and shows a link when it is ready. The link begins with ws://. Paste it here, or ask whoever started the game to send it to you. The phone and the Mac must be on the same Wi-Fi.",
        linkFooterMac: "The game starts on this Mac and shows a link when it is ready. The link begins with ws://. Paste it here.",
        linkWrong: "This link does not open a game. Use the one the game shows on the Mac: it begins with ws://.",
        sit: "Sit down at the table",
        recorded: "A recorded game",
        recordedFooter: "This is how the game looks. It is a recording: your answers change nothing in it.",
        yard: "The fight in the mill yard",
        road: "The road with the wagons",
        story: "Story",
        place: "Who's where",
        sheet: "Sheet",
        menu: "Menu",
        pause: "Pause",
        goOn: "Resume the game",
        leave: "Leave the table",
        leaveAsk: "The others will finish their turns, and yours will wait for you. Nothing you played is lost: the same link brings you back to where you stopped.",
        stay: "Stay",
        offline: "No connection to the game",
        offlineMore: "Nothing is lost. Connecting again.",
        elsewhere: "The game is open on another device",
        elsewhereMore: "Nothing is lost.",
        playHere: "Play here",
        send: "Send",
        game: "Game",
        whole: "The whole list"
    )

    /// The table's language (`hello`, by way of the chrome state), or the phone's with no table.
    static func of(_ language: String?) -> Words {
        let code = language ?? Locale.preferredLanguages.first ?? "en"
        return code.hasPrefix("ru") ? ru : en
    }
}
