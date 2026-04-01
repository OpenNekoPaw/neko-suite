/**
 * MessageClassifier Tests
 */

import { describe, it, expect } from 'vitest';
import { MessageClassifier } from '../message-classifier';
import type { ChatMessage } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

function userMsg(content: string): ChatMessage {
  return { role: 'user', content };
}

function assistantMsg(content: string, toolCalls?: ChatMessage['toolCalls']): ChatMessage {
  return { role: 'assistant', content, toolCalls };
}

function toolMsg(content: string): ChatMessage {
  return { role: 'tool', content, toolCallId: 'call_1' };
}

function toolCall(name: string): NonNullable<ChatMessage['toolCalls']>[number] {
  return { id: 'call_1', type: 'function', function: { name, arguments: '{}' } };
}

// =============================================================================
// Tests
// =============================================================================

describe('MessageClassifier', () => {
  const classifier = new MessageClassifier();

  describe('P1: user messages', () => {
    it('classifies all user messages as user_message', () => {
      const result = classifier.classify([userMsg('请帮我画一只猫')]);
      expect(result).toHaveLength(1);
      expect(result[0]!.infoType).toBe('user_message');
      expect(result[0]!.priority).toBe(1);
      expect(result[0]!.retentionHint).toBe('keep');
    });

    it('classifies user messages regardless of content', () => {
      const msgs = [userMsg('hello'), userMsg('风格改成赛博朋克'), userMsg('OK')];
      const results = classifier.classify(msgs);
      for (const r of results) {
        expect(r.infoType).toBe('user_message');
      }
    });
  });

  describe('P2: creative decisions', () => {
    it('detects style keywords in assistant responses', () => {
      const result = classifier.classify([assistantMsg('我建议使用水墨风格作为整体基调')]);
      expect(result[0]!.infoType).toBe('creative_decision');
      expect(result[0]!.priority).toBe(2);
    });

    it('detects composition keywords', () => {
      const result = classifier.classify([
        assistantMsg('The composition uses rule of thirds with warm palette'),
      ]);
      expect(result[0]!.infoType).toBe('creative_decision');
    });

    it('detects narrative keywords', () => {
      const result = classifier.classify([assistantMsg('叙事结构采用三幕式')]);
      expect(result[0]!.infoType).toBe('creative_decision');
    });
  });

  describe('P3: version anchors', () => {
    it('detects satisfaction keywords in assistant messages', () => {
      const result = classifier.classify([assistantMsg('这版不错，我已保存为 v3')]);
      expect(result[0]!.infoType).toBe('version_anchor');
      expect(result[0]!.priority).toBe(3);
    });

    it('detects English anchor keywords', () => {
      const result = classifier.classify([assistantMsg('This looks good, keeping as checkpoint')]);
      expect(result[0]!.infoType).toBe('version_anchor');
    });
  });

  describe('P4: iteration chains (generation tools)', () => {
    it('detects generation tool calls', () => {
      const result = classifier.classify([
        assistantMsg('Generating image...', [toolCall('generate_image')]),
      ]);
      expect(result[0]!.infoType).toBe('iteration_chain');
      expect(result[0]!.priority).toBe(4);
    });

    it('detects render tool calls', () => {
      const result = classifier.classify([
        assistantMsg('Rendering...', [toolCall('render_scene')]),
      ]);
      expect(result[0]!.infoType).toBe('iteration_chain');
    });

    it('detects generation results in tool messages', () => {
      const result = classifier.classify([
        toolMsg('{"model": "sdxl", "prompt": "a cat", "seed": 42}'),
      ]);
      expect(result[0]!.infoType).toBe('iteration_chain');
    });
  });

  describe('P5: asset state operations', () => {
    it('detects layer tool calls', () => {
      const result = classifier.classify([
        assistantMsg('Adding layer...', [toolCall('add_layer')]),
      ]);
      expect(result[0]!.infoType).toBe('asset_state');
      expect(result[0]!.priority).toBe(5);
    });

    it('detects timeline tool calls', () => {
      const result = classifier.classify([
        assistantMsg('Editing timeline...', [toolCall('timeline_split')]),
      ]);
      expect(result[0]!.infoType).toBe('asset_state');
    });

    it('detects asset state in tool results', () => {
      const result = classifier.classify([
        toolMsg('{"layers": [{"id": 1, "name": "bg"}], "canvas": "1920x1080"}'),
      ]);
      expect(result[0]!.infoType).toBe('asset_state');
    });
  });

  describe('P6: aesthetic preferences', () => {
    it('detects aesthetic adjustment keywords', () => {
      const result = classifier.classify([assistantMsg('已将画面调得更暖，对比度降低20%')]);
      expect(result[0]!.infoType).toBe('aesthetic_pref');
      expect(result[0]!.priority).toBe(6);
    });

    it('detects English aesthetic keywords', () => {
      const result = classifier.classify([
        assistantMsg('Made the scene warmer with less saturated colors'),
      ]);
      expect(result[0]!.infoType).toBe('aesthetic_pref');
    });
  });

  describe('P7: other', () => {
    it('classifies generic assistant messages as other', () => {
      const result = classifier.classify([assistantMsg('好的，我来帮你处理一下')]);
      expect(result[0]!.infoType).toBe('other');
      expect(result[0]!.priority).toBe(7);
      expect(result[0]!.retentionHint).toBe('discard');
    });

    it('classifies system messages as other', () => {
      const result = classifier.classify([
        { role: 'system', content: 'You are an assistant' } as ChatMessage,
      ]);
      expect(result[0]!.infoType).toBe('other');
    });
  });

  describe('mixed message classification', () => {
    it('correctly classifies a mixed conversation', () => {
      const messages: ChatMessage[] = [
        userMsg('用赛博朋克风格画一只猫'),
        // Contains '风格' (creative decision keyword) AND generate tool call.
        // Creative decision (P2) takes precedence over iteration chain (P4).
        assistantMsg('好的，我会用赛博朋克风格来创作', [toolCall('generate_image')]),
        toolMsg('{"model": "sdxl", "prompt": "cyberpunk cat", "seed": 123}'),
        userMsg('太暗了，亮一点'),
        assistantMsg('已调整亮度，画面更暖了'),
        userMsg('这版不错'),
      ];

      const results = classifier.classify(messages);

      expect(results[0]!.infoType).toBe('user_message'); // P1
      expect(results[1]!.infoType).toBe('creative_decision'); // P2 (keyword '风格' wins)
      expect(results[2]!.infoType).toBe('iteration_chain'); // P4 (generation result)
      expect(results[3]!.infoType).toBe('user_message'); // P1
      expect(results[4]!.infoType).toBe('aesthetic_pref'); // P6
      expect(results[5]!.infoType).toBe('user_message'); // P1
    });
  });

  describe('custom configuration', () => {
    it('respects custom keywords', () => {
      const custom = new MessageClassifier({
        userMessageRetention: 'all',
        versionAnchorKeywords: ['LGTM'],
        creativeDecisionKeywords: ['像素风'],
        aestheticPrefKeywords: ['模糊'],
        summaryBudget: {
          creativeDecisions: 500,
          versionAnchors: 300,
          iterationChains: 600,
          assetStates: 300,
          aestheticPrefs: 300,
        },
      });

      expect(custom.classify([assistantMsg('LGTM')])[0]!.infoType).toBe('version_anchor');
      expect(custom.classify([assistantMsg('采用像素风')])[0]!.infoType).toBe('creative_decision');
      expect(custom.classify([assistantMsg('图片有点模糊')])[0]!.infoType).toBe('aesthetic_pref');
    });
  });
});
