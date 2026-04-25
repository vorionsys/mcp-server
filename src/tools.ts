/**
 * MCP Tool Definitions for Vorion Governance
 *
 * JSON Schema definitions for each tool exposed by the MCP server.
 * These schemas are used by AI agents (Claude, GPT, Cursor, etc.)
 * to understand what parameters each tool accepts.
 */

export const TOOL_DEFINITIONS = {
  vorion_check_trust: {
    name: 'vorion_check_trust',
    description:
      'Look up an AI agent\'s current trust score and tier in the Vorion governance system. ' +
      'Returns the numeric score (0-1000), tier number (T0-T7), tier name, and observation tier. ' +
      'Use this to check how trusted an agent is before allowing it to perform sensitive actions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: {
          type: 'string',
          description: 'Unique identifier of the agent to look up',
        },
      },
      required: ['agentId'],
    },
  },

  vorion_record_signal: {
    name: 'vorion_record_signal',
    description:
      'Record a behavioral signal (positive or negative) for an AI agent. ' +
      'Positive signals (success, compliance pass) increase trust over time. ' +
      'Negative signals (failure, compliance fail) decrease trust — and higher-tier agents ' +
      'are penalized MORE severely per the BASIS penalty ratio P(T) = 3 + T.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: {
          type: 'string',
          description: 'Unique identifier of the agent',
        },
        type: {
          type: 'string',
          enum: [
            'behavioral.success',
            'behavioral.failure',
            'compliance.pass',
            'compliance.fail',
          ],
          description: 'Type of behavioral signal to record',
        },
        value: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description:
            'Signal strength from 0.0 (weakest) to 1.0 (strongest). ' +
            'For success/pass signals, higher means better performance. ' +
            'For failure/fail signals, higher means worse violation.',
        },
      },
      required: ['agentId', 'type', 'value'],
    },
  },

  vorion_gate_action: {
    name: 'vorion_gate_action',
    description:
      'Check if an AI agent is allowed to perform a specific action based on its current trust tier. ' +
      'Returns whether the action is allowed, the agent\'s current tier, the required tier, and a reason. ' +
      'Use this as a pre-flight check before executing sensitive operations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: {
          type: 'string',
          description: 'Unique identifier of the agent requesting the action',
        },
        action: {
          type: 'string',
          description:
            'The action the agent wants to perform (e.g., "read:documents", "write:database", "execute:deploy")',
        },
        requiredTier: {
          type: 'number',
          minimum: 0,
          maximum: 7,
          description:
            'Minimum trust tier (0-7) required to perform this action. ' +
            'T0=Sandbox, T1=Observed, T2=Provisional, T3=Monitored, T4=Standard, T5=Trusted, T6=Certified, T7=Autonomous',
        },
      },
      required: ['agentId', 'action', 'requiredTier'],
    },
  },

  vorion_log_proof: {
    name: 'vorion_log_proof',
    description:
      'Log a governance decision to the Vorion proof chain — an immutable, hash-linked audit trail. ' +
      'Every ALLOW or DENY decision is recorded with the agent ID, action, and reasoning. ' +
      'Returns a proof hash and the current chain length for verification.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: {
          type: 'string',
          description: 'Unique identifier of the agent involved in the decision',
        },
        action: {
          type: 'string',
          description: 'The action that was evaluated (e.g., "read:sensitive-data")',
        },
        decision: {
          type: 'string',
          enum: ['ALLOW', 'DENY'],
          description: 'Whether the action was allowed or denied',
        },
        reason: {
          type: 'string',
          description: 'Human-readable explanation for the decision',
        },
      },
      required: ['agentId', 'action', 'decision', 'reason'],
    },
  },
  vorion_execute_governed: {
    name: 'vorion_execute_governed',
    description:
      'Gate + execute + log in one atomic call. Checks if the agent has sufficient trust tier, ' +
      'executes the action if allowed, records the outcome as a behavioral signal, and logs a proof. ' +
      'Returns the full governance trail: gate decision, execution result, trust delta, and proof hash. ' +
      'This is the recommended way to run governed tool calls — replaces manual check-then-execute patterns.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: {
          type: 'string',
          description: 'Unique identifier of the agent performing the action',
        },
        action: {
          type: 'string',
          description: 'The action to perform (e.g., "read:documents", "write:database")',
        },
        risk: {
          type: 'string',
          enum: ['READ', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
          description: 'Risk level of the action. Determines minimum trust tier required: READ/LOW=T0, MEDIUM=T2, HIGH=T4, CRITICAL=T5',
        },
        description: {
          type: 'string',
          description: 'Human-readable description of what the action does (logged in proof chain)',
        },
      },
      required: ['agentId', 'action', 'risk', 'description'],
    },
  },

  // ---------------------------------------------------------------------------
  // Runtime API tools — talk to the deployed Cognigate API (remote mode)
  // ---------------------------------------------------------------------------

  vorion_tenant_whoami: {
    name: 'vorion_tenant_whoami',
    description:
      'Resolve the calling API key against the deployed Cognigate Runtime. ' +
      'Returns the tenant id, role, and capabilities the key is scoped to. ' +
      'Use this first if you need to confirm which tenant context the MCP session is running in. ' +
      'Requires VORION_API_URL + VORION_API_KEY env vars.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  vorion_tenant_list: {
    name: 'vorion_tenant_list',
    description:
      'List all tenants registered on the Cognigate Runtime. ' +
      'Admin-only. Returns id, name, tier, createdAt, and agent counts. ' +
      'Requires an admin-role API key in VORION_API_KEY.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  vorion_tenant_audit_tail: {
    name: 'vorion_tenant_audit_tail',
    description:
      'Tail the most recent audit events for a tenant (default: caller\'s own tenant). ' +
      'Each event carries hash-chained provenance: eventId, priorProofHash, proofHash. ' +
      'Use this to verify governance activity is being recorded correctly or to surface the live ' +
      'audit stream in a dashboard / glass window.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant to tail. If omitted, defaults to the caller\'s tenant (from the API key).',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 200,
          description: 'Number of most recent events to return (default 20, max 200).',
        },
      },
      required: [],
    },
  },

  vorion_canary_submit: {
    name: 'vorion_canary_submit',
    description:
      'Submit a canary probe result to the Cognigate Runtime. Canary probes are adversarial or ' +
      'behavioral test cases that measure whether an agent responded correctly. Results classified ' +
      'as pass / fail / ambiguous feed the tenant\'s behavioral baseline and can trigger AUDITED ' +
      'state on repeated ambiguous outcomes. Returns the stored proofHash for chain verification.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: {
          type: 'string',
          description: 'Agent the probe was run against (e.g., "chef-jeff", "market-scout").',
        },
        probeId: {
          type: 'string',
          description: 'Stable identifier of the probe (e.g., "prompt-injection-basic-01").',
        },
        outcome: {
          type: 'string',
          enum: ['pass', 'fail', 'ambiguous'],
          description: 'Classification of the probe result.',
        },
        riskLevel: {
          type: 'string',
          enum: ['READ', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'LIFE_CRITICAL'],
          description: 'Risk level of the action the probe tested.',
        },
        evidence: {
          type: 'object',
          description: 'Optional evidence payload: the probe prompt, agent response, and scoring rationale.',
          additionalProperties: true,
        },
      },
      required: ['agentId', 'probeId', 'outcome', 'riskLevel'],
    },
  },

  vorion_health_check: {
    name: 'vorion_health_check',
    description:
      'Hit the Cognigate Runtime health endpoint. Returns status, uptime, and dependency state ' +
      '(proof store, audit log, metrics). Use this as a pre-flight check before relying on remote ' +
      'governance operations, or to confirm the deployed API is reachable.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
} as const;

/**
 * Tier table for the vorion_explain_tiers resource
 */
export const TIER_TABLE = {
  tiers: [
    {
      tier: 0,
      name: 'Sandbox',
      scoreRange: '0-199',
      description: 'New/untrusted agent. All actions sandboxed with full audit logging.',
      capabilities: ['rate_limit:10/min', 'audit:full', 'sandbox:true'],
      penaltyMultiplier: '3x',
    },
    {
      tier: 1,
      name: 'Observed',
      scoreRange: '200-349',
      description: 'Agent under active observation. Limited autonomy with strict monitoring.',
      capabilities: ['rate_limit:10/min', 'audit:full', 'sandbox:true'],
      penaltyMultiplier: '4x',
    },
    {
      tier: 2,
      name: 'Provisional',
      scoreRange: '350-499',
      description: 'Probationary agent. Moderate access with standard monitoring.',
      capabilities: ['rate_limit:100/min', 'audit:standard'],
      penaltyMultiplier: '5x',
    },
    {
      tier: 3,
      name: 'Monitored',
      scoreRange: '500-649',
      description: 'Established agent with consistent behavior. BLACK_BOX ceiling (600).',
      capabilities: ['rate_limit:100/min', 'audit:standard'],
      penaltyMultiplier: '6x',
    },
    {
      tier: 4,
      name: 'Standard',
      scoreRange: '650-799',
      description: 'Reliable agent. Broad access with light monitoring.',
      capabilities: ['rate_limit:1000/min', 'audit:light'],
      penaltyMultiplier: '7x',
    },
    {
      tier: 5,
      name: 'Trusted',
      scoreRange: '800-875',
      description: 'Highly trusted agent. Minimal constraints.',
      capabilities: ['rate_limit:1000/min', 'audit:light'],
      penaltyMultiplier: '8x',
    },
    {
      tier: 6,
      name: 'Certified',
      scoreRange: '876-950',
      description: 'Certified agent with formal verification. Near-autonomous operation.',
      capabilities: ['minimal_constraints'],
      penaltyMultiplier: '9x',
    },
    {
      tier: 7,
      name: 'Autonomous',
      scoreRange: '951-1000',
      description: 'Fully autonomous agent. Self-governing with post-hoc audit only.',
      capabilities: ['minimal_constraints'],
      penaltyMultiplier: '10x',
    },
  ],
  specification: 'BASIS (Baseline Authority for Safe & Interoperable Systems)',
  penaltyFormula: 'P(T) = 3 + T — higher-tier agents are punished more severely for failures',
  initialScore: 0,
  scoreRange: '0-1000',
  hysteresis: [25, 25, 20, 20, 15, 10, 10, 10],
  decayHalfLife: '182 days',
};
