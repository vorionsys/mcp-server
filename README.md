# @vorionsys/mcp-server

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)

**MCP server that exposes ten Vorion tools over stdio: five local in-memory trust helpers, and five experimental remote Cognigate calls.**

> **Status:** Published on npm as `@vorionsys/mcp-server@0.3.2` (latest, not deprecated; the process still reports MCP server version `0.1.0`). Local stdio tools boot and score in memory via `@vorionsys/sdk@1.0.1` (agents start at 500 / T3; success +2; failure −20). Remote Cognigate tools are experimental and unverified (never run against a live server), no named MCP client is evidenced in this repo, and `npm test` is 4 passed / 0 failed (tool-definition and tier-table shape only).

**Known issues:** `zod@^3.23.0` resolves to 3.25.76 (this lockfile and a fresh install). 3.25.76 is inside [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (vulnerable range `< 4.6.6`: memory exhaustion while validating oversized constrained collections).

This server registers ten tools and two resources on a stdio MCP transport. The five local tools look up or adjust an in-process score and append to an in-memory proof log. The five remote tools are experimental: they are always registered, and without both `VORION_API_URL` and `VORION_API_KEY` they return an error and do not open a socket. Nothing here enforces a decision on the caller's OS or network. A pre-flight result is data for the client.

---

## Quick start

`@vorionsys/mcp-server@0.3.2` is the npm `latest` dist-tag and is not deprecated. `@0.1.0` and `@0.2.0` are deprecated with `Package withdrawn pending IP review. Do not use.` `@0.3.0` and `@0.3.1` are not marked deprecated; they depend on `@vorionsys/sdk@^0.3.1`. This tree and the `0.3.2` publish depend on `@vorionsys/sdk@^1.0.1`.

From the registry (this resolves `@vorionsys/proof-plane` to 0.1.5, which is not deprecated):

```bash
npm install @vorionsys/mcp-server@0.3.2
npx -y @vorionsys/mcp-server@0.3.2
```

From this repository (the lockfile installs `@vorionsys/proof-plane@0.1.4`):

```bash
git clone https://github.com/vorionsys/mcp-server.git && cd mcp-server && npm ci && npm run build
node dist/index.js
```

`dist/index.js` is the stdio entrypoint. `package.json` also exposes it as the `vorion-mcp` bin, and the compiled file keeps the `#!/usr/bin/env node` shebang. `npm run dev` is `tsx src/index.ts`.

The process speaks newline-delimited JSON-RPC on stdin/stdout. It does not listen on a port. A bare `node dist/index.js` waits for stdin; it does not print a prompt.

`npm ci` in this repo prints `Package withdrawn pending IP review. Do not use.` That string is the stale `deprecated` field stored in `package-lock.json` for `@vorionsys/proof-plane@0.1.4`. The live registry text for 0.1.4 is: `Not published as a standalone package — Vorion's trust engine is delivered via the hosted platform. See https://vorion.org`. `@vorionsys/proof-plane@0.1.5` is not deprecated. `@vorionsys/sdk@1.0.1` is not deprecated.

---

## What the local tools actually do

Wired to an MCP client, the local tools return JSON text. They do not run the action you name.

- **Score and tier.** `vorion_check_trust` registers the agent on first use (`capabilities: ['*']`, `observationTier: 'GRAY_BOX'`) and returns the SDK's in-memory score. With `@vorionsys/sdk@1.0.1` in local mode, a new agent starts at **500**, tier **3** (`Monitored`), observation tier **GRAY_BOX**. The documented bands in `src/tools.ts` are T0–T7 over 0–1000. The same file's `initialScore: 0` does not match the SDK, which starts at 500.
- **Signals.** `vorion_record_signal` accepts `behavioral.success`, `behavioral.failure`, `compliance.pass`, and `compliance.fail`. Success and compliance-pass call `reportSuccess` (**+2**, capped at 1000). Failure and compliance-fail call `reportFailure` (**−20**, floored at 0). The numeric `value` argument is copied into the tool result and is not passed to the SDK. The delta does not depend on tier. The formula `P(T) = 3 + T` appears only as a string on the static `vorion://tiers` document. This server does not apply it.
- **Pre-flight.** `vorion_gate_action` compares the agent's current tier number to `requiredTier` and returns `allowed` plus a reason. It does not record a signal.
- **Proof log.** `vorion_log_proof` appends one event to the default in-memory store from `@vorionsys/proof-plane` (`createProofPlane` with no custom store). That library hashes the event (`eventHash`, `previousHash`). Signatures are off (`enableSignatures: false`). The tool result's `proofHash` is `event.hash ?? event.eventId`. The stored event has no `hash` field, so the value returned to the client is the event id (a UUID), not `eventHash`. The log dies with the process.
- **Combined call.** `vorion_execute_governed` maps risk to a minimum tier (`READ`/`LOW` = 0, `MEDIUM` = 2, `HIGH` = 4, `CRITICAL` = 5), then records a success signal if the tier check passes or a failure signal if it does not, then appends a proof event. It does not execute `action`. An allow still moves the score by +2.

---

## What's in the box

### Local tools (no API key)

| Tool | What this server does |
|---|---|
| `vorion_check_trust` | Return score, tier number, tier name, observation tier, and capabilities for `agentId`. |
| `vorion_record_signal` | Apply a flat +2 or −20 from the signal type. `value` is echoed, not applied. |
| `vorion_gate_action` | Return whether `tierNumber >= requiredTier`. No signal, no proof event. |
| `vorion_log_proof` | Append an in-memory proof-plane event for `ALLOW` or `DENY`. The returned `proofHash` is the event id. |
| `vorion_execute_governed` | Gate, then record +2 or −20, then append a proof event. Does not run the action. |

### Remote Cognigate tools (experimental / unverified)

These five tools have never been run against a live server. They are registered even when the env vars are unset. Paths below are what `src/index.ts` would request; the response body would be whatever that URL returns.

`VORION_API_URL` must be `https`. The four tenant and canary tools send `VORION_API_KEY` as a bearer token to that URL. `src/index.ts` does not check the scheme: `cognigateFetch` concatenates `VORION_API_URL` and calls `fetch` with the bearer header anyway. `vorion_health_check` does not send the key, and it also does not check the scheme.

| Tool | Request |
|---|---|
| `vorion_tenant_whoami` | `GET /api/v1/tenants/me` with `Authorization: Bearer <VORION_API_KEY>`. |
| `vorion_tenant_list` | `GET /api/v1/tenants` with the same bearer header. On HTTP 403 the result adds a hint that the key is not admin. This process does not check a role itself. |
| `vorion_tenant_audit_tail` | Resolves the tenant (argument, or `GET /api/v1/tenants/me`), then `GET /api/v1/tenants/{id}/audit-events?limit=`. Default limit 20, max 200. The server does not verify a hash chain in the body. |
| `vorion_canary_submit` | `POST /api/v1/canary` with `outcome` of `pass`, `fail`, or `ambiguous`. |
| `vorion_health_check` | `GET /api/v1/health` with no bearer header. Both env vars must still be non-empty or the tool never calls `fetch`. |

If either env var is empty, `vorion_tenant_whoami`, `vorion_tenant_list`, `vorion_tenant_audit_tail`, and `vorion_canary_submit` return `Remote Cognigate API is not configured. Set VORION_API_URL and VORION_API_KEY environment variables on the MCP server to enable runtime tools.` `vorion_health_check` returns `VORION_API_URL not set. Remote health check unavailable.` even when the URL is set and only the key is missing. Local tools keep working.

### Resources

- `vorion://tiers` — static JSON (`TIER_TABLE` in `src/tools.ts`): eight tiers, score bands, a penalty-formula string, and `initialScore: 0`. It is a static document in this repo, not a live readout of the SDK.
- `vorion://agents/{agentId}/trust` — a resource template. Reading it registers the agent if needed and returns the same trust fields as `vorion_check_trust`, plus `getActionHistory()`.

---

## Telemetry and privacy

What `src/index.ts` does with the installed local dependencies:

- **Local tools do not call `fetch`.** The SDK is constructed as `new Vorion({ localMode: true })`, which keeps the score in a `Map` on the process. The proof log uses `createInMemoryEventStore()`. `@vorionsys/proof-plane` depends on `kafkajs` and ships a `KafkaEventStore`; this server never constructs it.
- **This repository does not import an analytics or crash-reporting client.** There is no Sentry or PostHog import in `src/`.
- **Outbound HTTP is only the five remote tools, and only when both env vars are non-empty.** Set `VORION_API_URL` to an `https` URL. The four tenant/canary tools send `Authorization: Bearer <VORION_API_KEY>` to whatever string is in `VORION_API_URL`. The source does not reject an `http` URL before attaching that header. `vorion_health_check` does not send the key. If either variable is empty, those tools return the errors above and do not call `fetch`.
- **This file's only `console` write is `console.error` in the startup `catch`.** With `enableSignatures: false`, the proof-plane warning about `PROOF_SIGNING_KEY` does not run. The server does not log tool arguments.

`src/index.ts` reads only `VORION_API_URL` and `VORION_API_KEY`.

---

## Install

Install `@vorionsys/mcp-server@0.3.2` from npm, or build this repo. Public npm install is the intended path. Do not use `@0.1.0` or `@0.2.0`; those two versions are deprecated with `Package withdrawn pending IP review. Do not use.`

`@vorionsys/sdk@^1.0.1` has an optional peer `@vorionsys/runtime`. This server does not import it. `@vorionsys/sdk@0.3.1` (the dependency of published 0.3.0 and 0.3.1) is a different package: commit `ad182ce` in this repo records that its dist imported `@vorionsys/security` and that `npx` exited with `ERR_MODULE_NOT_FOUND`. That import is not how `@1.0.1` is wired, and it is not what a current `npm install` of `@vorionsys/mcp-server@0.3.2` gets.

---

## Client configuration

No Claude Desktop, Cursor, or other named MCP client session is recorded in this repo. The blocks below are the shape this process expects.

Published package:

```json
{
  "mcpServers": {
    "vorion": {
      "command": "npx",
      "args": ["-y", "@vorionsys/mcp-server@0.3.2"]
    }
  }
}
```

Local build (absolute path to your clone):

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

Remote tools are experimental. Point `VORION_API_URL` at an `https` URL you operate. The process will still attach the bearer token if the value is `http`.

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

The MCP server object is constructed with `name: 'vorion'`. The tool names it registers already start with `vorion_`. How a client prefixes that server name is up to the client; this repo does not show it.

---

## Troubleshooting

**1. `ERR_MODULE_NOT_FOUND` for `@vorionsys/security` (or `atsf-core`, `a3i`, `runtime`) at startup.**
That was the failure mode recorded for `@vorionsys/sdk@0.3.1` in commit `ad182ce`. It is not the dependency line in this tree or in published `@vorionsys/mcp-server@0.3.2`, both of which use `@vorionsys/sdk@^1.0.1`. If you still see it, the install is not 0.3.2 (for example an older `npx` resolution, or a leftover `node_modules`). `npm ls @vorionsys/sdk @vorionsys/mcp-server` should show sdk 1.0.x and mcp-server 0.3.2.

**2. The client reports `node: command not found`, or Node exits on syntax / `fetch is not defined`.**
`package.json` sets `"engines": { "node": ">=20.0.0" }`. Build with `npm run build` before pointing a client at `dist/index.js`. `src/index.ts` is not a Node entrypoint; use `npm run dev` for the `tsx` path.

**3. A remote tool returns a not-configured error, or a network error.**
Both `VORION_API_URL` and `VORION_API_KEY` have to be set on the server process, and `VORION_API_URL` must be `https` because the bearer key is sent to it. The source does not enforce `https`. The four tenant/canary tools then say `Remote Cognigate API is not configured` when either variable is empty. The health tool says `VORION_API_URL not set` when either variable is missing. A network error means `fetch` could not reach the URL you set. HTTP 403 from `vorion_tenant_list` is passed through with an admin hint. These tools are experimental and have never been run against a live server.

---

## Development

```bash
npm ci
npm run build      # tsc -> dist/
npm test           # vitest run
npm run typecheck  # tsc --noEmit
npm run dev        # tsx src/index.ts
```

`npm test` loads `tests/placeholder.test.ts` only. It asserts that `TOOL_DEFINITIONS` has the ten names and that `TIER_TABLE` has eight tiers and contains the string `P(T) = 3 + T`. It does not start the server, call the SDK, or send HTTP.

---

## Stack

- **Runtime:** Node.js `>=20` (`engines`), ES modules (`"type": "module"`). CI workflow (`.github/workflows/ci.yml`): Node 22, typecheck, build, and `npm test` on pushes and pull requests to `main`.
- **Language:** TypeScript `^5.9.3`, `strict`, `NodeNext` (`tsconfig.json`).
- **MCP SDK:** `@modelcontextprotocol/sdk` `^1.28.0`. This repo's lockfile resolves 1.29.0. Transport in `src/index.ts` is `StdioServerTransport` only.
- **Vorion deps:** `@vorionsys/sdk` `^1.0.1` (resolved 1.0.1, not deprecated). `@vorionsys/proof-plane` `^0.1.4` (lockfile 0.1.4, deprecated on the registry; a fresh install of the published server resolved 0.1.5, not deprecated).
- **Schema:** `zod` `^3.23.0`, resolved to 3.25.76. See Known issues for GHSA-mrhx-c7xc-m3w5.
- **Tests:** `vitest` `^4.1.5`.
- **Not in this process:** an HTTP MCP transport. `@hono/node-server` is overridden in `package.json` and is not imported by `src/`.

---

## Provenance

`package.json` `repository` points at this GitHub repo, and that is the `origin` of this checkout.

The extraction commit in this repo (`ecf966a`, message `chore: initial extraction of @vorionsys/mcp-server@0.3.0 from monorepo`) records three facts this public history cannot re-check: monorepo commit `3d7ed92d` (April 20 2026, `feat(mcp-server): add remote Cognigate Runtime tools (v0.3.0)`), a private pull request `voriongit/vorion#137`, and a license change from `UNLICENSED` to Apache-2.0 at extraction. `gh` cannot resolve a public repository named `voriongit/vorion`. The license file in this repo is Apache-2.0. The published `0.3.2` tarball's npm `gitHead` is `ad182ce`, not `ecf966a`.

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).

Copyright 2026 Vorion LLC. See [NOTICE](./NOTICE) for attribution.

---

## Links

- **Vorion LLC:** https://vorion.org
- **BASIS specification:** https://github.com/Vorion-Labs/basis-spec-docs (`voriongit/basis-spec-docs` redirects there)
- **Issues:** https://github.com/vorionsys/mcp-server/issues
