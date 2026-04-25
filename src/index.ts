#!/usr/bin/env node
/**
 * @vorionsys/mcp-server — Vorion Governance MCP Server
 *
 * Exposes Vorion trust scoring, proof logging, and tier lookup
 * to AI agents via the Model Context Protocol (MCP).
 *
 * Stage 2 of the Vorion GTM flywheel:
 *   SDK (done) -> MCP server (this) -> hosted API -> standards
 *
 * Usage with Claude Desktop:
 *   Add to claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "vorion": {
 *         "command": "npx",
 *         "args": ["@vorionsys/mcp-server"]
 *       }
 *     }
 *   }
 *
 * @packageDocumentation
 */

import * as crypto from 'node:crypto';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Vorion } from '@vorionsys/sdk';
import { createProofPlane } from '@vorionsys/proof-plane';
import type { ProofPlane } from '@vorionsys/proof-plane';
import { TOOL_DEFINITIONS, TIER_TABLE } from './tools.js';

// ---------------------------------------------------------------------------
// Globals — single Vorion SDK instance in local mode + proof plane
// ---------------------------------------------------------------------------

const vorion = new Vorion({ localMode: true });

const proofPlane: ProofPlane = createProofPlane({
  signedBy: 'vorion-mcp-server',
  enableSignatures: false,       // Local mode — no key needed
  environment: 'development',
});

// ---------------------------------------------------------------------------
// Helper: ensure agent exists (auto-register on first use)
// ---------------------------------------------------------------------------

async function ensureAgent(agentId: string) {
  let agent = vorion.getAgent(agentId);
  if (!agent) {
    agent = await vorion.registerAgent({
      agentId,
      name: agentId,
      capabilities: ['*'],          // MCP agents get full capabilities in local mode
      observationTier: 'GRAY_BOX',
    });
  }
  return agent;
}

// ---------------------------------------------------------------------------
// Tier name helper (matches SDK's internal mapping)
// ---------------------------------------------------------------------------

function tierNumberToName(tier: number): string {
  const names = [
    'Sandbox',      // T0
    'Observed',     // T1
    'Provisional',  // T2
    'Monitored',    // T3
    'Standard',     // T4
    'Trusted',      // T5
    'Certified',    // T6
    'Autonomous',   // T7
  ];
  return names[tier] ?? 'Unknown';
}

// ---------------------------------------------------------------------------
// Create MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'vorion',
  version: '0.1.0',
});

// ---------------------------------------------------------------------------
// Tool: vorion_check_trust
// ---------------------------------------------------------------------------

server.tool(
  TOOL_DEFINITIONS.vorion_check_trust.name,
  TOOL_DEFINITIONS.vorion_check_trust.description,
  {
    agentId: z.string().describe('Unique identifier of the agent to look up'),
  },
  async ({ agentId }) => {
    const agent = await ensureAgent(agentId);
    const info = await agent.getTrustInfo();

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              agentId,
              score: info.score,
              tier: info.tierNumber,
              tierName: info.tierName,
              observationTier: info.observationTier,
              capabilities: agent.getCapabilities(),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: vorion_record_signal
// ---------------------------------------------------------------------------

server.tool(
  TOOL_DEFINITIONS.vorion_record_signal.name,
  TOOL_DEFINITIONS.vorion_record_signal.description,
  {
    agentId: z.string().describe('Unique identifier of the agent'),
    type: z.enum([
      'behavioral.success',
      'behavioral.failure',
      'compliance.pass',
      'compliance.fail',
    ]).describe('Type of behavioral signal to record'),
    value: z.number().describe('Signal strength from 0.0 to 1.0'),
  },
  async ({ agentId, type, value }) => {
    const agent = await ensureAgent(agentId);
    const beforeInfo = await agent.getTrustInfo();
    const oldScore = beforeInfo.score;
    const oldTier = beforeInfo.tierNumber;

    // Map signal type to SDK methods
    const isPositive = type === 'behavioral.success' || type === 'compliance.pass';

    if (isPositive) {
      await agent.reportSuccess(type);
    } else {
      await agent.reportFailure(type, `Signal value: ${value}`);
    }

    const afterInfo = await agent.getTrustInfo();

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              agentId,
              signalType: type,
              signalValue: value,
              oldScore,
              newScore: afterInfo.score,
              scoreDelta: afterInfo.score - oldScore,
              oldTier: oldTier,
              newTier: afterInfo.tierNumber,
              tierChange: afterInfo.tierNumber !== oldTier
                ? `${tierNumberToName(oldTier)} -> ${tierNumberToName(afterInfo.tierNumber)}`
                : null,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: vorion_gate_action
// ---------------------------------------------------------------------------

server.tool(
  TOOL_DEFINITIONS.vorion_gate_action.name,
  TOOL_DEFINITIONS.vorion_gate_action.description,
  {
    agentId: z.string().describe('Unique identifier of the agent requesting the action'),
    action: z.string().describe('The action the agent wants to perform'),
    requiredTier: z.number().describe('Minimum trust tier (0-7) required for this action'),
  },
  async ({ agentId, action, requiredTier }) => {
    const agent = await ensureAgent(agentId);
    const info = await agent.getTrustInfo();
    const agentTier = info.tierNumber;
    const allowed = agentTier >= requiredTier;

    const reason = allowed
      ? `Agent is T${agentTier} (${info.tierName}), meets T${requiredTier} (${tierNumberToName(requiredTier)}) requirement`
      : `Agent is T${agentTier} (${info.tierName}), below T${requiredTier} (${tierNumberToName(requiredTier)}) requirement`;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              allowed,
              agentId,
              action,
              agentTier,
              agentTierName: info.tierName,
              requiredTier,
              requiredTierName: tierNumberToName(requiredTier),
              reason,
              score: info.score,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: vorion_log_proof
// ---------------------------------------------------------------------------

server.tool(
  TOOL_DEFINITIONS.vorion_log_proof.name,
  TOOL_DEFINITIONS.vorion_log_proof.description,
  {
    agentId: z.string().describe('Unique identifier of the agent involved in the decision'),
    action: z.string().describe('The action that was evaluated'),
    decision: z.enum(['ALLOW', 'DENY']).describe('Whether the action was allowed or denied'),
    reason: z.string().describe('Human-readable explanation for the decision'),
  },
  async ({ agentId, action, decision, reason }) => {
    const correlationId = crypto.randomUUID();
    const decisionId = crypto.randomUUID();

    const agent = await ensureAgent(agentId);
    const info = await agent.getTrustInfo();

    const result = await proofPlane.logEvent(
      'decision_made' as any,
      correlationId,
      {
        type: 'decision_made',
        decisionId,
        intentId: correlationId,
        permitted: decision === 'ALLOW',
        trustBand: info.tierName,
        trustScore: info.score,
        reasoning: [reason],
      } as any,
      agentId,
    );

    const stats = await proofPlane.getStats();
    const event = result.event as any;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              agentId,
              action,
              decision,
              reason,
              proofHash: event.hash ?? event.eventId,
              eventId: event.eventId,
              chainLength: stats.totalEvents,
              timestamp: event.timestamp ?? new Date().toISOString(),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: vorion_execute_governed (v2 — atomic gate + execute + proof)
// ---------------------------------------------------------------------------

const RISK_TIER_MAP: Record<string, number> = {
  READ: 0, LOW: 0, MEDIUM: 2, HIGH: 4, CRITICAL: 5,
};

server.tool(
  TOOL_DEFINITIONS.vorion_execute_governed.name,
  TOOL_DEFINITIONS.vorion_execute_governed.description,
  {
    agentId: z.string().describe('Agent performing the action'),
    action: z.string().describe('Action to perform'),
    risk: z.enum(['READ', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).describe('Risk level'),
    description: z.string().describe('What the action does'),
  },
  async ({ agentId, action, risk, description }) => {
    const agent = await ensureAgent(agentId);
    const beforeInfo = await agent.getTrustInfo();
    const requiredTier = RISK_TIER_MAP[risk] ?? 2;
    const allowed = beforeInfo.tierNumber >= requiredTier;

    // Step 1: Gate decision
    const gateReason = allowed
      ? `Agent T${beforeInfo.tierNumber} meets T${requiredTier} requirement for ${risk} action`
      : `Agent T${beforeInfo.tierNumber} below T${requiredTier} requirement for ${risk} action`;

    // Step 2: Record behavioral signal (success if allowed, failure if denied)
    if (allowed) {
      await agent.reportSuccess(action);
    } else {
      await agent.reportFailure(action, `Denied: ${gateReason}`);
    }

    const afterInfo = await agent.getTrustInfo();

    // Step 3: Log proof
    const correlationId = crypto.randomUUID();
    const decisionId = crypto.randomUUID();

    const result = await proofPlane.logEvent(
      'decision_made' as any,
      correlationId,
      {
        type: 'decision_made',
        decisionId,
        intentId: correlationId,
        permitted: allowed,
        trustBand: afterInfo.tierName,
        trustScore: afterInfo.score,
        reasoning: [gateReason, description],
      } as any,
      agentId,
    );

    const stats = await proofPlane.getStats();
    const event = result.event as any;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              // Gate result
              allowed,
              action,
              risk,
              description,
              gateReason,

              // Agent state
              agentId,
              tierBefore: beforeInfo.tierNumber,
              tierAfter: afterInfo.tierNumber,
              scoreBefore: beforeInfo.score,
              scoreAfter: afterInfo.score,
              scoreDelta: afterInfo.score - beforeInfo.score,
              tierChange: afterInfo.tierNumber !== beforeInfo.tierNumber
                ? `${tierNumberToName(beforeInfo.tierNumber)} -> ${tierNumberToName(afterInfo.tierNumber)}`
                : null,

              // Proof
              proofHash: event.hash ?? event.eventId,
              eventId: event.eventId,
              chainLength: stats.totalEvents,

              // Guidance
              nextAction: allowed
                ? 'Action permitted. Trust score updated. Proof logged.'
                : `Action denied. Agent needs T${requiredTier}+ (${tierNumberToName(requiredTier)}). Current: T${afterInfo.tierNumber} (score ${afterInfo.score.toFixed(0)}). Earn trust through successful lower-risk actions first.`,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Remote mode: Cognigate Runtime API client
// ---------------------------------------------------------------------------
// These tools talk to the deployed Cognigate API over HTTP. They are only
// registered if VORION_API_URL is set. VORION_API_KEY (tenant-bound) is
// required for every remote call. We fail-soft with a structured error if
// either is missing so the MCP surface stays usable in local-only mode.

const VORION_API_URL = process.env.VORION_API_URL ?? '';
const VORION_API_KEY = process.env.VORION_API_KEY ?? '';

function remoteConfigured(): boolean {
  return VORION_API_URL.length > 0 && VORION_API_KEY.length > 0;
}

async function cognigateFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; error: string }> {
  if (!remoteConfigured()) {
    return {
      ok: false,
      status: 0,
      error:
        'Remote Cognigate API is not configured. Set VORION_API_URL and VORION_API_KEY ' +
        'environment variables on the MCP server to enable runtime tools.',
    };
  }

  const url = `${VORION_API_URL.replace(/\/$/, '')}${path}`;
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${VORION_API_KEY}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Keep as text if not JSON
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          typeof parsed === 'object' && parsed !== null && 'message' in parsed
            ? String((parsed as { message: unknown }).message)
            : `HTTP ${res.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`,
      };
    }

    return { ok: true, status: res.status, data: parsed as T };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: `Network error contacting Cognigate API: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function textResponse(obj: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(obj, null, 2),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tool: vorion_tenant_whoami
// ---------------------------------------------------------------------------

server.tool(
  TOOL_DEFINITIONS.vorion_tenant_whoami.name,
  TOOL_DEFINITIONS.vorion_tenant_whoami.description,
  {},
  async () => {
    const result = await cognigateFetch('/api/v1/tenants/me');
    if (!result.ok) {
      return textResponse({ ok: false, status: result.status, error: result.error });
    }
    return textResponse({ ok: true, apiUrl: VORION_API_URL, ...(result.data as object) });
  },
);

// ---------------------------------------------------------------------------
// Tool: vorion_tenant_list
// ---------------------------------------------------------------------------

server.tool(
  TOOL_DEFINITIONS.vorion_tenant_list.name,
  TOOL_DEFINITIONS.vorion_tenant_list.description,
  {},
  async () => {
    const result = await cognigateFetch<{ tenants: unknown[] }>('/api/v1/tenants');
    if (!result.ok) {
      return textResponse({
        ok: false,
        status: result.status,
        error: result.error,
        hint:
          result.status === 403
            ? 'This key does not have admin role. Use an admin-scoped VORION_API_KEY.'
            : undefined,
      });
    }
    return textResponse({ ok: true, ...(result.data as object) });
  },
);

// ---------------------------------------------------------------------------
// Tool: vorion_tenant_audit_tail
// ---------------------------------------------------------------------------

server.tool(
  TOOL_DEFINITIONS.vorion_tenant_audit_tail.name,
  TOOL_DEFINITIONS.vorion_tenant_audit_tail.description,
  {
    tenantId: z.string().optional().describe('Tenant to tail. Defaults to caller\'s tenant.'),
    limit: z.number().min(1).max(200).optional().describe('Events to return (default 20).'),
  },
  async ({ tenantId, limit }) => {
    const effectiveLimit = limit ?? 20;

    // Resolve tenant if not provided
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const me = await cognigateFetch<{ tenantId: string }>('/api/v1/tenants/me');
      if (!me.ok) {
        return textResponse({ ok: false, status: me.status, error: me.error });
      }
      resolvedTenantId = (me.data as { tenantId: string }).tenantId;
    }

    const result = await cognigateFetch<{ events: unknown[] }>(
      `/api/v1/tenants/${encodeURIComponent(resolvedTenantId)}/audit-events?limit=${effectiveLimit}`,
    );
    if (!result.ok) {
      return textResponse({ ok: false, status: result.status, error: result.error });
    }
    return textResponse({ ok: true, tenantId: resolvedTenantId, limit: effectiveLimit, ...(result.data as object) });
  },
);

// ---------------------------------------------------------------------------
// Tool: vorion_canary_submit
// ---------------------------------------------------------------------------

server.tool(
  TOOL_DEFINITIONS.vorion_canary_submit.name,
  TOOL_DEFINITIONS.vorion_canary_submit.description,
  {
    agentId: z.string().describe('Agent the probe was run against'),
    probeId: z.string().describe('Stable probe identifier'),
    outcome: z.enum(['pass', 'fail', 'ambiguous']).describe('Classification of the probe result'),
    riskLevel: z.enum(['READ', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'LIFE_CRITICAL']).describe('Risk level'),
    evidence: z.record(z.unknown()).optional().describe('Optional evidence payload'),
  },
  async ({ agentId, probeId, outcome, riskLevel, evidence }) => {
    const result = await cognigateFetch<{ proofHash: string; eventId: string }>(
      '/api/v1/canary',
      {
        method: 'POST',
        body: JSON.stringify({
          agentId,
          probeId,
          outcome,
          riskLevel,
          evidence: evidence ?? {},
          submittedAt: new Date().toISOString(),
        }),
      },
    );
    if (!result.ok) {
      return textResponse({ ok: false, status: result.status, error: result.error });
    }
    return textResponse({ ok: true, agentId, probeId, outcome, riskLevel, ...(result.data as object) });
  },
);

// ---------------------------------------------------------------------------
// Tool: vorion_health_check
// ---------------------------------------------------------------------------

server.tool(
  TOOL_DEFINITIONS.vorion_health_check.name,
  TOOL_DEFINITIONS.vorion_health_check.description,
  {},
  async () => {
    if (!remoteConfigured()) {
      return textResponse({
        ok: false,
        status: 0,
        error: 'VORION_API_URL not set. Remote health check unavailable.',
        mode: 'local-only',
      });
    }
    // Health endpoint is unauthenticated — bypass bearer header
    const url = `${VORION_API_URL.replace(/\/$/, '')}/api/v1/health`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        // not JSON
      }
      return textResponse({
        ok: res.ok,
        status: res.status,
        apiUrl: VORION_API_URL,
        data: parsed,
      });
    } catch (err) {
      return textResponse({
        ok: false,
        status: 0,
        apiUrl: VORION_API_URL,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

// ---------------------------------------------------------------------------
// Resource: vorion_explain_tiers — the 8-tier trust model
// ---------------------------------------------------------------------------

server.resource(
  'trust-tiers',
  'vorion://tiers',
  {
    description:
      'The BASIS 8-tier trust model (T0 Sandbox through T7 Autonomous). ' +
      'Shows score ranges, capabilities, penalty multipliers, and the penalty formula P(T) = 3 + T.',
    mimeType: 'application/json',
  },
  async () => ({
    contents: [
      {
        uri: 'vorion://tiers',
        mimeType: 'application/json',
        text: JSON.stringify(TIER_TABLE, null, 2),
      },
    ],
  }),
);

// ---------------------------------------------------------------------------
// Resource: agent trust profile (parameterized)
// ---------------------------------------------------------------------------

server.resource(
  'agent-trust',
  new ResourceTemplate('vorion://agents/{agentId}/trust', { list: undefined }),
  {
    description: 'Current trust information for a specific agent',
    mimeType: 'application/json',
  },
  async (uri, { agentId }) => {
    const id = Array.isArray(agentId) ? agentId[0] : agentId;
    const agent = await ensureAgent(id);
    const info = await agent.getTrustInfo();

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              agentId: id,
              score: info.score,
              tier: info.tierNumber,
              tierName: info.tierName,
              observationTier: info.observationTier,
              capabilities: agent.getCapabilities(),
              actionHistory: agent.getActionHistory(),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error starting Vorion MCP server:', error);
  process.exit(1);
});
