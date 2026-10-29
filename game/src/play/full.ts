// The whole adventure, Scene 1 to Scene 6, in one run (M7 spec §4.1, TASKS.md AGT-14): `npm run
// play:full`, or with a run profile `npm run play:cheap` and `npm run play:demo`. Russian by default,
// with the 120-minute stop and the stall stop after 12 quiet explore rounds; any setting typed after
// the command overrides the profile (`npm run play:cheap -- --dm-model claude-opus-5-5`). Run on
// Stas's Mac under his Claude login (decision 0036). The run itself is in driver.ts.
import { npmCommand, playRun } from "./driver.ts";

await playRun(
  {
    command: npmCommand("play:full"), folder: "full",
    defaults: { lang: "ru", "time-limit-min": 120, "stall-rounds": 12, "max-steps": 50_000 },
    allScenes: true,
  },
  process.argv.slice(2),
);
