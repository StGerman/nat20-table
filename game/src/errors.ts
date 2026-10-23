// Why a model call ended without an answer. The loop stops the run on the first (decision 0036)
// and falls back on the second (M6 spec §6); neither is a retry.

/** The plan's usage limit was reached (decision 0036): the run stops cleanly, no retry. */
export class UsageLimitReached extends Error {
  readonly resetsAt: number | undefined;
  constructor(resetsAt: number | undefined) {
    super(
      `The Claude plan's usage limit was reached${resetsAt ? `; it resets at ${new Date(resetsAt * 1000).toISOString()}` : ""}.`,
    );
    this.resetsAt = resetsAt;
  }
}

/** A turn ran past its timeout and was interrupted. */
export class TurnTimeout extends Error {}
