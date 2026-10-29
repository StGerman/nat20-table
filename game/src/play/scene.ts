// Scenes of a scenario pack with the DM agent and the AI players (M6 spec §8, runbook Part 2): by
// default Scene 3 of The Silent Mill, the yard fight, with Bren on a scripted seat, or played by you in
// the terminal UI with --seat ink. The exit run (`npm run play:exit`) plays Scene 1 and Scene 3 with
// you as Bren. Run on Stas's Mac under his Claude login (decision 0036): `npm run play:scene`. The
// run itself, its flags and its record are in driver.ts.
import { npmCommand, playRun } from "./driver.ts";

await playRun({ command: npmCommand("play:scene"), folder: "scene" }, process.argv.slice(2));
