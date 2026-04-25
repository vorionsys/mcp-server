/**
 * MCP Server — export verification test.
 *
 * Verifies that tool definitions and tier table are correctly exported
 * and structurally valid.
 */

import { describe, it, expect } from 'vitest';
import { TOOL_DEFINITIONS, TIER_TABLE } from '../src/tools';

describe('mcp-server tool definitions', () => {
  it('exports all ten tool definitions (5 local + 5 remote runtime)', () => {
    const tools = Object.keys(TOOL_DEFINITIONS);
    expect(tools).toHaveLength(10);

    // Local trust-engine tools
    expect(tools).toContain('vorion_check_trust');
    expect(tools).toContain('vorion_record_signal');
    expect(tools).toContain('vorion_gate_action');
    expect(tools).toContain('vorion_log_proof');
    expect(tools).toContain('vorion_execute_governed');

    // Remote Cognigate Runtime tools (v0.3.0)
    expect(tools).toContain('vorion_tenant_whoami');
    expect(tools).toContain('vorion_tenant_list');
    expect(tools).toContain('vorion_tenant_audit_tail');
    expect(tools).toContain('vorion_canary_submit');
    expect(tools).toContain('vorion_health_check');
  });

  it('each tool has name, description, and inputSchema', () => {
    for (const [key, tool] of Object.entries(TOOL_DEFINITIONS)) {
      expect(tool.name).toBe(key);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.required).toBeDefined();
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
    }
  });
});

describe('mcp-server tier table', () => {
  it('exports 8 tiers (T0-T7)', () => {
    expect(TIER_TABLE.tiers).toHaveLength(8);
    TIER_TABLE.tiers.forEach((tier, i) => {
      expect(tier.tier).toBe(i);
      expect(typeof tier.name).toBe('string');
      expect(typeof tier.description).toBe('string');
    });
  });

  it('penalty formula matches BASIS spec', () => {
    expect(TIER_TABLE.penaltyFormula).toContain('P(T) = 3 + T');
  });
});
