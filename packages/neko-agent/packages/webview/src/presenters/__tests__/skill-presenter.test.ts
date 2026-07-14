import { describe, expect, it } from 'vitest';
import { projectSkillInjectionState } from '../skill-presenter';

describe('skill-presenter', () => {
  it('projects lifecycle records from skill injection messages', () => {
    expect(
      projectSkillInjectionState({
        conversationId: 'conv-1',
        skillName: 'style-reference',
        lifecycle: {
          records: [
            {
              id: 'record-1',
              skillName: 'style-reference',
              slot: 'referenceSkill',
              owner: 'agent',
              clearable: true,
            },
            {
              id: 'record-2',
              skillName: 'quality-review',
              slot: 'domainSkill',
              owner: 'user',
              clearable: true,
              allowedTools: ['ReadDocument'],
            },
          ],
        },
      }),
    ).toMatchObject({
      activeSkill: {
        conversationId: 'conv-1',
        skillName: 'style-reference',
        records: [
          expect.objectContaining({ id: 'record-1', clearable: true }),
          expect.objectContaining({ id: 'record-2', clearable: true }),
        ],
      },
    });
  });

  it('projects single Skill injection messages as a clearable domain record', () => {
    expect(
      projectSkillInjectionState({
        conversationId: 'conv-1',
        skillName: 'quality-review',
        allowedTools: ['ReadDocument'],
      }).activeSkill.records,
    ).toEqual([
      {
        id: 'quality-review',
        skillName: 'quality-review',
        slot: 'domainSkill',
        owner: 'user',
        clearable: true,
        allowedTools: ['ReadDocument'],
      },
    ]);
  });
});
