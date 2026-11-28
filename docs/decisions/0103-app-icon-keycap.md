# 0103. The app's icon is a keycap with the F of Fine Print

- **Status:** Proposed
- **Date:** 2026-11-28
- **Decided by:** Stas, in the "Build the iPhone app in SwiftUI" thread, 2026-11-28: the keycap as the direction (08:24Z, with a 3D object icon as the reference), the orange key on a card (08:27Z), then five rounds on its form until "Давай теперь боковую грань ровной и готово" (08:47Z); the touch-typing bump under the F, about 30% softer than first drawn (09:07Z); accepted on merge

## Context

The iPhone and Mac targets in `shell/` carried no icon, so both showed the system's blank tile. Facts checked:

- Apple's guidelines (app icons, 2026) ask for one 1024 px square with no rounded corners on the iPhone, the iPad and the Mac: the system cuts the shape and makes the smaller sizes. They name light, dark, clear and tinted appearances, and the system makes any appearance the app does not supply. Layered Icon Composer files are recommended; a flat bitmap is still accepted, and the system tries to split it into layers itself.
- The design system «Fine Print» gives the colours (`accent`, `ink`, `glass-solid`) and the text face (Literata, decision 0098). The F is set in Literata, which is under the SIL Open Font License; a picture made with the font is not bound by it.

## Options

### A. A keycap with the F, drawn as a solid object
- Pro: one object, one letter, legible at 29 px; it reads as "a key you press", and as a nod to the key players press to pay respects.
- Pro: it is ours, drawn from the design system's colours; nothing is traced or generated.
- Con: a 3D object is harder to keep consistent with flat marks inside the app; the system's own glass effects are applied to a flat bitmap we did not layer.

### B. The drop cap of Fine Print with lines of small print (flat)
- Pro: closest to the page's own look; simple.
- Con: at small sizes the lines of small print become noise; Stas called it a good working version and asked for the keycap.

### C. A generated picture
- Con: a picture in the scene style does not hold at 29 px, and the icon is the one mark every player sees.

## Decision

A (Stas). An orange key (`accent`) with the F in `glass-solid` fills the whole tile, with no ground around it: its walls are flat and their edge to the top face is slightly rounded; the top face is a dish shaped like an old television screen; one light falls from the upper left. Under the F, as on a real keyboard, is the small raised bar a finger finds the home row by: the key's own plastic, as wide as the letter, halfway between the letter's foot and the top face's lower edge, with the F in the middle of the top face. Below 60 px it fades, as it does on a real key. The dark appearance is the same key in slate with the F in the dark `accent`. Clear and tinted are left to the system.

## Consequences

- `shell/Shared/Assets.xcassets/AppIcon.appiconset` holds the light and dark 1024 px pictures for the iPhone and the Mac's sizes cut from the light one; both targets name it in `project.yml`.
- The pictures are rendered, not drawn by hand: a height map of the key lit per pixel. The source and the other candidates are in the design system «Fine Print» (Icon group) and in the project's files (`demo/fine-print-design-system/icon/`), not in this repository.
- Not yet: an Icon Composer file with real layers, and a check of how the system's glass treats the flat picture on a real phone and Mac.

## Revisit when

The icon looks wrong on a real home screen or Dock (the system's glass or its tinted version spoils it), a playtest reader does not recognise it as the game, or the App Store listing needs a layered icon.

## Sources

- Apple Human Interface Guidelines, App icons: https://developer.apple.com/design/human-interface-guidelines/app-icons
- Design system «Fine Print», Icon group: https://claude.ai/artifact/4JAabAo9XsvNAPPzVgKMsB
- Decision [0098](0098-story-type-and-page-marks.md) (Literata, the marks)
