// The run's transcript: every line any seat received or wrote, with its channel and the roll ids it
// cites (M6 spec §3.5, §3.6; step 6 adds the audit and the leak scan over it).
import { appendFileSync } from "node:fs";
import type { Channel, TranscriptRecord } from "./types.ts";

/** Every `[rN]` the text cites, in order. */
export function citedRolls(text: string): string[] {
  return [...text.matchAll(/\[r(\d+)\]/g)].map((m) => `r${m[1]}`);
}

export class Transcript {
  readonly records: TranscriptRecord[] = [];
  private readonly file: string | undefined;
  private readonly logHead: () => number;
  private readonly clock: () => string;

  /** `clock` stamps each line; a fixture passes a fixed one so the transcript replays exactly. */
  constructor(file: string | undefined, logHead: () => number, clock: () => string = () => new Date().toISOString()) {
    this.file = file;
    this.logHead = logHead;
    this.clock = clock;
  }

  add(entry: { speaker: string; channel: Channel; kind: TranscriptRecord["kind"]; text: string; human?: boolean }): TranscriptRecord {
    const record: TranscriptRecord = {
      at: this.clock(),
      speaker: entry.speaker,
      channel: entry.channel,
      kind: entry.kind,
      text: entry.text,
      rolls: citedRolls(entry.text),
      log_head: this.logHead(),
      ...(entry.human ? { human: true } : {}),
    };
    this.records.push(record);
    if (this.file) appendFileSync(this.file, JSON.stringify(record) + "\n");
    return record;
  }
}
