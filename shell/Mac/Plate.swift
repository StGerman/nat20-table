// The picture of the scene's place on the right page of the Mac's open book (CON-26), from the
// pictures the app holds beside the page (`page/plates/<pack>/<name>.jpg`, laid out by the page's
// build). A place whose picture is not drawn yet is a placeholder that says what kind of picture
// it is, of which place, and which file is missing (Stas, 2026-11-25), so a picture of the window
// tells what to draw.
import AppKit
import SwiftUI

struct Plate: View {
    let place: Chrome.Place
    let words: Words

    var body: some View {
        if let image = Self.image(place.plate) {
            GeometryReader { box in
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: box.size.width, height: box.size.height)
                    .clipped()
            }
            .accessibilityElement()
            .accessibilityLabel(place.name)
            .accessibilityIdentifier("plate")
        } else {
            VStack(spacing: 10) {
                Image(systemName: "photo")
                    .font(.system(size: 44, weight: .light))
                    .padding(.bottom, 6)
                Text(words.noPlate)
                    .font(.headline)
                Text(place.name)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(place.plate)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)
            }
            .multilineTextAlignment(.center)
            .foregroundStyle(.secondary)
            .padding(40)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [10, 8]))
                    .foregroundStyle(.tertiary)
                    .padding(20)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("plate-missing")
        }
    }

    /// The pictures read so far, by name; a name that has none is remembered too.
    @MainActor private static var seen: [String: NSImage?] = [:]

    /// The picture by the name the table gave. The name came over the wire: only `<pack>/<file>.jpg`
    /// in plain letters is looked for, under the page's own pictures.
    @MainActor
    static func image(_ name: String) -> NSImage? {
        if let known = seen[name] { return known }
        let plain = Set("abcdefghijklmnopqrstuvwxyz0123456789_-")
        let parts = name.split(separator: "/", omittingEmptySubsequences: false)
        var image: NSImage?
        if parts.count == 2, parts[1].hasSuffix(".jpg"), !parts[0].isEmpty, parts[1].count > 4,
           parts[0].allSatisfy({ plain.contains($0) }), parts[1].dropLast(4).allSatisfy({ plain.contains($0) }),
           let url = Bundle.main.resourceURL?.appendingPathComponent("page/plates/\(name)") {
            image = NSImage(contentsOf: url)
        }
        seen[name] = image
        return image
    }
}
