import { describe, expect, it } from 'vitest';
import { projectSkillInjectionState } from '../skill-presenter';

describe('skill-presenter', () => {
  it('projects lifecycle records from skill injection messages', () => {
    expect(
      projectSkillInjectionState({
        conversationId: 'conv-1',
        skillName: 'creation-persona',
        lifecycle: {
          records: [
            {
              id: 'record-1',
              skillName: 'creation-persona',
              slot: 'stagePersona',
              owner: 'idc',
              clearable: false,
              lockedReason: 'stage owned',
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
    ).toEqual({
      activeSkill: {
        conversationId: 'conv-1',
        skillName: 'creation-persona',
        records: [
          expect.objectContaining({ id: 'record-1', clearable: false }),
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
