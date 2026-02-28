import { describe, expect, it } from 'vitest';
import { isPermanentAgentDefinitionName } from '../../db/agent-definition-db.js';

describe('agent definition permanent surface rules', () => {
  it('treats hub and prompt-analyst as the only permanent names', () => {
    expect(isPermanentAgentDefinitionName('hub')).toBe(true);
    expect(isPermanentAgentDefinitionName('Hub')).toBe(true);
    expect(isPermanentAgentDefinitionName('prompt-analyst')).toBe(true);
    expect(isPermanentAgentDefinitionName('Prompt Analyst')).toBe(true);
    expect(isPermanentAgentDefinitionName('prompt_analyst')).toBe(true);

    expect(isPermanentAgentDefinitionName('coordinator')).toBe(false);
    expect(isPermanentAgentDefinitionName('executor')).toBe(false);
    expect(isPermanentAgentDefinitionName('reviewer')).toBe(false);
  });
});
