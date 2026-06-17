# @vorionsys/mcp-server

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)

**Model Context Protocol server exposing Vorion AI governance — local trust scoring, proof logging, and optional remote Cognigate Runtime tools.**

This server lets MCP clients (Claude Desktop, Cursor, IDEs, agent frameworks) call Vorion governance primitives directly: check an agent's trust tier, record behavioral signals, gate actions by required tier, log proof-chained decisions, and — when configured with a deployed Cognigate Runtime endpoint — submit canary probes, tail tenant audit streams, and run health checks against a live runtime.

> BASIS is to AI-agent governance what OAuth is to delegated authorization — an open standard so an agent trusted by one system can be evaluated by another.

> **Status: source-available / reference use.** This repository is the canonical home for the Vorion MCP server. The npm package `@vorionsys/mcp-server` and its runtime dependencies are currently **withdrawn pending IP review** (see [Install / current status](#install--current-status)). Use it as a reference for how a governance layer is exposed over MCP, and as the source you build from once the dependency chain is published.

---

## Quick start (one command to clone + build)

The published npm package is withdrawn (see below), so install from this repo:

```bash
# Clone, install, build — then the stdio entrypoint is dist/index.js
git clone https://github.com/voriongit/mcp-server.git && cd mcp-server && npm install && npm run build
```

The build produces an executable stdio server at `dist/index.js` (the package also exposes it as a `vorion-mcp` bin). To run it directly once built:

```bash
node dist/index.js
```

Or run from source without building (uses `tsx`):

```bash
npm run dev
```

The server speaks the Model Context Protocol over **stdio** — it does not print to stdout except MCP frames, and it does not open a port. It is meant to be launched by an MCP client (see [Use with Claude Desktop](#use-with-claude-desktop)), not run interactively.

> Heads-up before you run it: a clean public install does not boot yet. The runtime depends on `@vorionsys/sdk`, which pulls a chain of `@vorionsys/*` packages that are withdrawn pending IP review — so the server currently exits at startup with `ERR_MODULE_NOT_FOUND`. See [Troubleshooting](#troubleshooting) for exactly what you'll see and why.

---

## What trust signals you get

When an MCP client wires this server in, your agent's tool calls can be governed instead of blindly executed. In practice you get:

- **A trust score and tier per agent** (`0–1000`, mapped to tiers `T0`–`T7`) so a client can decide how much autonomy an agent has earned — not just whether a single call looks safe.
- **A pre-flight allow/deny** (`vorion_gate_action` / `vorion_execute_governed`) that checks an agent's tier against the risk of an action *before* it runs.
- **Behavioral feedback that moves the score** — successes raise trust, failures lower it, and higher-tier agents are penalized more for failures (penalty formula `P(T) = 3 + T`).
- **A hash-chained proof log** of every ALLOW/DENY decision, so the reasoning behind a governed action is auditable after the fact.
- **(Optional, remote) tenant + canary visibility** against a deployed Cognigate Runtime: who an API key resolves to, a tail of the hash-chained audit stream, and a place to submit canary-probe outcomes.

These are governance *signals* for a client to act on — they don't themselves block your OS or network; enforcement is up to the client that consumes them.

---

## What's in the box

### Local trust-engine tools (run locally, no API key)

| Tool | Purpose |
|---|---|
| `vorion_check_trust` | Look up an agent's score (0–1000), tier (T0–T7), and observation tier. |
| `vorion_record_signal` | Record a behavioral signal (`behavioral.success` / `behavioral.failure` / `compliance.pass` / `compliance.fail`). |
| `vorion_gate_action` | Pre-flight check: does the agent meet the required tier for an action? |
| `vorion_log_proof` | Log an ALLOW/DENY decision to the hash-chained proof log. |
| `vorion_execute_governed` | Gate + record signal + log proof in one call (recommended). |

### Remote Cognigate Runtime tools (require `VORION_API_URL` + `VORION_API_KEY`)

| Tool | Purpose |
|---|---|
| `vorion_tenant_whoami` | Resolve the calling API key to its tenant id, role, and capabilities. |
| `vorion_tenant_list` | List all tenants on the runtime (admin-only). |
| `vorion_tenant_audit_tail` | Tail recent hash-chained audit events for a tenant. |
| `vorion_canary_submit` | Submit a canary probe result (pass / fail / ambiguous) to the runtime. |
| `vorion_health_check` | Hit the configured Cognigate Runtime `/api/v1/health` endpoint. |

Without `VORION_API_URL` + `VORION_API_KEY`, the remote tools still appear in the surface but return a structured `not configured` error — the local trust-engine tools are unaffected.

### Resources

- `vorion://tiers` — the BASIS 8-tier trust model (score ranges, capabilities, penalty multipliers, penalty formula).
- `vorion://agents/{agentId}/trust` — current trust profile for a specific agent.

---

## Telemetry & privacy

Read the source if you want to confirm any of this — it is all in [`src/index.ts`](./src/index.ts).

- **The five local trust-engine tools make no network calls.** They run entirely in-process against the local trust engine and an in-memory proof log. Nothing is sent anywhere.
- **No analytics, no usage telemetry, no crash reporting.** There is no Sentry/PostHog/"phone-home" code path. The only thing written to a remote service is the explicit remote-tool calls you make.
- **The only outbound network calls** come from the five *remote* tools, and only when **both** `VORION_API_URL` and `VORION_API_KEY` are set. In that case the server makes HTTPS requests **to the Cognigate Runtime URL you configure** (e.g. your own deployment), sending your `VORION_API_KEY` as a `Bearer` token and the arguments you passed to the tool. If those env vars are unset, no outbound request is ever attempted.
- **The server logs only to stderr**, and only on a fatal startup error. It does not log tool inputs/outputs.

In short: with no env vars configured, this is a fully local server with no telemetry. Any network traffic is an explicit remote tool call to an endpoint you chose.

---

## Install / current status

**Do not `npm install @vorionsys/mcp-server`.** That package — along with its runtime dependencies `@vorionsys/sdk` and `@vorionsys/proof-plane` — is currently **deprecated on npm with the message "withdrawn pending IP review."** Install from this repository instead (see [Quick start](#quick-start-one-command-to-clone--build)).

Because the dependency chain is mid-review, a clean public clone will install and build but will **not yet boot at runtime** (the SDK imports withdrawn private `@vorionsys/*` peers that npm cannot resolve). Treat this repo as **reference / source-available** until those packages are published. See [Troubleshooting](#troubleshooting).

---

## Use with Claude Desktop

Because the npm package is withdrawn, point Claude Desktop at your **locally built** copy rather than `npx`-ing the published package. After running the [Quick start](#quick-start-one-command-to-clone--build), add the following to `claude_desktop_config.json` (use the absolute path to *your* clone's `dist/index.js`):

```json
{
  "mcpServers": {
    "vorion": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

To enable the **remote Cognigate Runtime tools** (`vorion_tenant_whoami`, `vorion_tenant_list`, `vorion_tenant_audit_tail`, `vorion_canary_submit`, `vorion_health_check`), add the two environment variables, pointing `VORION_API_URL` at *your* runtime deployment:

```json
{
  "mcpServers": {
    "vorion": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "VORION_API_URL": "https://your-cognigate-runtime.example.com",
        "VORION_API_KEY": "vrn_live_..."
      }
    }
  }
}
```

The server is registered under the name `vorion`, so its tools appear as `vorion_*` in the client. `VORION_API_URL` and `VORION_API_KEY` are the only two environment variables the server reads.

---

## Troubleshooting

The three most common setup failures, in order of likelihood:

**1. `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@vorionsys/...'` at startup.**
This is expected today on a clean public install. `@vorionsys/sdk` pulls a chain of `@vorionsys/*` packages (e.g. `atsf-core`, `security`, `a3i`, `runtime`) that are **withdrawn pending IP review** and therefore cannot be resolved from the public npm registry. The build (`npm run build`) succeeds, but `node dist/index.js` exits immediately. There is no public workaround until those packages are published — this is why the repo is currently labeled reference / source-available. If you have access to the Vorion monorepo, install/link those peers there and run from that workspace.

**2. The server starts but immediately exits, or your client says "node: command not found" / a syntax error.**
Check your Node version: `node --version`. This server requires **Node.js >= 20** (it uses native ESM and the global `fetch`). On older Node you'll see module-resolution or `fetch is not defined` errors. Also make sure you ran `npm run build` first — `args` in the Claude Desktop config must point to the compiled `dist/index.js` (or use `npm run dev` for the `tsx` source path), not `src/index.ts` directly.

**3. The remote tools return `Remote Cognigate API is not configured` (or a network error).**
The five remote tools require **both** `VORION_API_URL` and `VORION_API_KEY` to be set in the server's `env`. If either is missing you'll get a structured `not configured` error — that's by design, and the local tools keep working. If both are set but you get a network error, the URL is unreachable from where the server runs; if you get `403` on `vorion_tenant_list`, your key lacks the admin role. Note this is a **stdio** server: it must be launched by an MCP client (or piped JSON-RPC), not run as an interactive command — a bare `node dist/index.js` in a terminal will just wait silently for stdin.

---

## Development

```bash
# Install dependencies
npm install

# Build (tsc -> dist/)
npm run build

# Run tests (vitest)
npm test

# Typecheck only
npm run typecheck

# Run from source over stdio (tsx)
npm run dev
```

---

## Stack

- **Runtime:** Node.js >= 20, ES modules (`type: module`).
- **Language:** TypeScript 5.x, strict mode, NodeNext resolution.
- **MCP SDK:** `@modelcontextprotocol/sdk` ^1.28.
- **Vorion deps:** `@vorionsys/sdk` ^0.3.1 (local trust engine) and `@vorionsys/proof-plane` ^0.1.4 (hash-chained event log) — **both withdrawn pending IP review on npm**; see [Install / current status](#install--current-status).
- **Schema validation:** `zod`.
- **Test runner:** `vitest`.
- **Transport:** stdio (Claude Desktop, Cursor, etc.). HTTP transport is not implemented.

---

## Provenance

This package was extracted from the Vorion monorepo at commit `3d7ed92d` (April 20 2026 — `feat(mcp-server): add remote Cognigate Runtime tools (v0.3.0)`).

The remote-runtime work was originally captured in the now-superseded PR [voriongit/vorion#137](https://github.com/voriongit/vorion/pull/137). That PR is closed in favor of this standalone repo per founder direction (Apr 24 2026).

License normalized from `UNLICENSED` to **Apache-2.0** at extraction time.

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).

Copyright 2026 Vorion LLC. See [NOTICE](./NOTICE) for attribution.

---

## Links

- **Vorion:** https://vorion.org
- **BASIS specification:** https://github.com/voriongit/basis-spec-docs
- **Issues:** https://github.com/voriongit/mcp-server/issues
