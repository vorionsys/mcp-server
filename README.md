# @vorionsys/mcp-server

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)

**Model Context Protocol server exposing Vorion AI governance — local trust scoring, proof logging, and remote Cognigate Runtime tools.**

This server lets MCP clients (Claude Desktop, Cursor, IDEs, agent frameworks) call Vorion governance primitives directly: check an agent's trust tier, record behavioral signals, gate actions by required tier, log proof-chained decisions, and — when configured with a deployed Cognigate Runtime endpoint — submit canary probes, tail tenant audit streams, and perform health checks against a live runtime.

It is **Stage 2 of the Vorion GTM flywheel**: SDK (done) → MCP server (this) → hosted API → standards.

---

## What's in the box

### Local trust-engine tools (work offline, no API key)

| Tool | Purpose |
|---|---|
| `vorion_check_trust` | Look up an agent's score (0–1000), tier (T0–T7), and observation tier. |
| `vorion_record_signal` | Record a behavioral signal (success / failure / compliance pass / fail). |
| `vorion_gate_action` | Pre-flight check: does the agent meet the required tier for an action? |
| `vorion_log_proof` | Log an ALLOW/DENY decision to the immutable hash-chained proof log. |
| `vorion_execute_governed` | Atomic gate + execute + signal + proof in one call (recommended). |

### Remote Cognigate Runtime tools (require `VORION_API_URL` + `VORION_API_KEY`)

| Tool | Purpose |
|---|---|
| `vorion_tenant_whoami` | Resolve the calling API key to its tenant id, role, and capabilities. |
| `vorion_tenant_list` | List all tenants on the runtime (admin-only). |
| `vorion_tenant_audit_tail` | Tail recent hash-chained audit events for a tenant. |
| `vorion_canary_submit` | Submit a canary probe result (pass / fail / ambiguous) to the runtime. |
| `vorion_health_check` | Hit the Cognigate Runtime `/api/v1/health` endpoint. |

### Resources

- `vorion://tiers` — the BASIS 8-tier trust model (score ranges, capabilities, penalty multipliers).
- `vorion://agents/{agentId}/trust` — current trust profile for a specific agent.

---

## Install

```bash
npm install @vorionsys/mcp-server
```

Or use directly via `npx`:

```bash
npx @vorionsys/mcp-server
```

---

## Use with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vorion": {
      "command": "npx",
      "args": ["@vorionsys/mcp-server"]
    }
  }
}
```

To enable the **remote Cognigate Runtime tools** (whoami, list, audit-tail, canary-submit, health-check), set environment variables:

```json
{
  "mcpServers": {
    "vorion": {
      "command": "npx",
      "args": ["@vorionsys/mcp-server"],
      "env": {
        "VORION_API_URL": "https://cognigate.dev",
        "VORION_API_KEY": "vrn_live_..."
      }
    }
  }
}
```

Without those env vars, the remote tools still appear in the surface but return a structured `not configured` error — the local trust-engine tools keep working.

---

## Development

```bash
# Install
npm install

# Build
npm run build

# Test
npm test

# Typecheck only
npm run typecheck

# Run locally (stdio transport)
npm run dev
```

---

## Stack

- **Runtime:** Node.js >= 20, ES modules (`type: module`).
- **Language:** TypeScript 5.7, strict mode, NodeNext resolution.
- **MCP SDK:** `@modelcontextprotocol/sdk` ^1.28.
- **Vorion deps:** `@vorionsys/sdk` ^0.3.1 (local trust engine), `@vorionsys/proof-plane` ^0.1.4 (hash-chained event log).
- **Schema validation:** `zod`.
- **Test runner:** `vitest`.
- **Transport:** stdio (Claude Desktop, Cursor, etc.). HTTP transport TBD.

---

## Provenance

This package was extracted from the Vorion monorepo at commit `3d7ed92d` (April 20 2026 — `feat(mcp-server): add remote Cognigate Runtime tools (v0.3.0)`).

The remote-runtime work was originally captured in the now-superseded PR [voriongit/vorion#137](https://github.com/voriongit/vorion/pull/137) (`feat(mcp-server): add 5 remote Cognigate Runtime tools (v0.3.0)`). That PR is closed in favor of this standalone polyrepo per founder direction (Apr 24 2026, "own repo").

License normalized from `UNLICENSED` to **Apache-2.0** at extraction time.

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).

Copyright 2026 Vorion LLC. See [NOTICE](./NOTICE) for attribution.

---

## Links

- **Vorion:** https://vorion.org
- **Cognigate Runtime:** https://cognigate.dev
- **BASIS specification:** https://github.com/voriongit/basis-spec-docs
- **Issues:** https://github.com/voriongit/mcp-server/issues
