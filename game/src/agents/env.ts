// The environment an agent's Claude Code process starts with. Node built-ins only, so the preflight
// can check the login the agents will use before `npm ci` has run.

/**
 * Variables an agent's Claude Code process may inherit. Everything else is dropped: a variable
 * from the shell that launched the game (a parent Claude Code session's, an `ANTHROPIC_API_KEY`)
 * can redirect the process to another account, another endpoint or another session's memory, and
 * the spike showed one doing exactly that. Without an API key the process uses the Claude login in
 * the home directory: Stas's subscription (decision 0036).
 */
const INHERITED_ENV = /^(PATH|HOME|USER|LOGNAME|SHELL|TERM|TMPDIR|LANG|LC_[A-Z]+|TZ|HTTPS?_PROXY|https?_proxy|NO_PROXY|no_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR)$/;

/** The environment for an agent's process: the allow-list above, plus the client name. */
export function agentEnv(parent: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(parent)) if (INHERITED_ENV.test(key)) env[key] = value;
  env.CLAUDE_AGENT_SDK_CLIENT_APP = "nat20-table/0.1.0";
  return env;
}
