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

/**
 * The Claude login is missing or expired, so no model call can succeed until the operator signs in
 * again. Like the usage limit, the run stops cleanly and counts neither way.
 */
export class LoginExpired extends Error {
  constructor(why: string) {
    super(`The Claude login expired or is missing (${why}). Run \`claude\` in a terminal to sign in again, then start the run again.`);
  }
}

/** What the SDK says when no call can be made for want of a login. */
export const LOGIN_FAILURE = /authenticat|oauth|not logged in|\/login|\b401\b|invalid api key/i;

/** A turn ran past its timeout and was interrupted. */
export class TurnTimeout extends Error {}

/**
 * A turn the loop interrupted because it no longer wants the answer: a reaction whose moment passed
 * (party talk R1, AGT-34). The session goes on, as after a timeout.
 */
export class TurnCancelled extends TurnTimeout {}

/**
 * A turn that failed or timed out after the SDK lost its connection to the API (a retry with no HTTP
 * response). The decision falls back like any failed turn; three in a row stop the run (M7 design §3.1).
 */
export class ConnectionLost extends Error {}

/** Model wakes kept failing with no connection (M7 design §3.1): the run stops, and counts neither way. */
export class ModelOffline extends Error {}
