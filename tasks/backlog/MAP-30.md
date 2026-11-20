---
type: Task
id: MAP-30
title: "Fair in Wend's prose agrees with its four days: no night at Wendford"
pri: P1
dest: Ours
size: XS
state: todo
area: "7. Maps and scenario (E7)"
---

In `full-2026-11-20T11-57-47-274Z` (build c249b2e, `play:unattended`, all AI, roster `allies`) the contract failed row 1: day 4 ended four miles short of Saltmouth. On day 2, after the ten miles of the slope track, Bren proposed «Ночуем здесь. Лагерь на лугу бесплатный», Maren agreed, and the DM gave the night at Wendford; half a day was lost, and the wagon made 12 miles on day 3. The two earlier runs with the four-day limit (`full-2026-11-17T21-50-53-659Z`, `full-2026-11-18T20-29-10-067Z`) went on past Wendford on day 2 and settled on day 4.

The pack's prose says three things about the time:
- `campaign.json` and `prose/adventure.md`: a night at the Highsteads and two on the road, the fair on the fourth day;
- `prose/fw_highsteads.md`, read aloud, Odda: "Fair starts the day after tomorrow", which is day 3;
- `prose/fw_wendford.md`, How to run it: "The Blades choose an inn night or a camp, and when to set off down the river road in the morning", which tells the DM to give the night at Wendford.

No agent sees `day_limit`: it only ends the run (`game/src/table/loop.ts`). The DM sees the clock (`game/src/view.ts`), the seats seldom do (one line with the day in the run's 243 seat inputs), so the prose is all the agents know of the deadline. Fix (content, prompt-only, no counter): Wendford is a midday stop on day 2, and its How to run it says so; Odda's line names the same day as `adventure.md`; Odda, who owns the wagon, says what an early camp costs when a Blade proposes one before evening. Zoya's board check before it goes to Stas, Vera on the changed read-aloud line. Lowest layer (decision 0080): a test with no model cannot see a DM's reading of prose, so a full run; `npm run pack:check` still passes.

## Status

todo. Filed 2026-11-20 by Stas's ask («заводи баг и приоритезирую его через Яна в следующую итерацию»); after the tech talk, since the stage tag `play-2026-12-02` is frozen.
