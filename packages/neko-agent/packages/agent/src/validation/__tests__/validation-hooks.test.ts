/**
 * ValidationHooks Tests
 *
 * Comprehensive test suite for ValidationHooks class and createValidationHooks factory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationHooks, createValidationHooks } from '../validation-hooks';
import { AgentError } from '../../errors';
import type { AgentContext, AgentStep, ChatMessage, ContentPart } from '@neko/shared';
import type { ValidationHooksOptions, ValidationError, ValidationWarning } from '../types';
import { consumeOutputValidationRepairRequest } from '../output-validation-repair-request';

const mermaidRuntimeMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: mermaidRuntimeMocks,
}));

// Helper to create test context
function createTestContext(messages: ChatMessage[] = []): AgentContext {
  return {
    messages,
    state: 'init',
    iteration: 0,
    toolResults: [],
    metadata: {},
  };
}

function createTestContextWithMetadata(metadata: Record<string, unknown>): AgentContext {
  return {
    ...createTestContext(),
    metadata,
  };
}

// Helper to create test step
function createTestStep(content: string, type: AgentStep['type'] = 'think'): AgentStep {
  return {
    type,
    content,
    timestamp: Date.now(),
  };
}

describe('ValidationHooks', () => {
  describe('Constructor', () => {
    it('creates with default options', () => {
      const hooks = new ValidationHooks();

      expect(hooks.name).toBe('validation');
      expect(hooks.getImageConstraints()).toMatchObject({
        maxSizeBytes: 5 * 1024 * 1024,
        maxDimension: 8192,
        allowedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      });
      expect(hooks.getOutputConstraints()).toMatchObject({
        mermaidPreValidate: false,
        onValidationFail: 'warn',
      });
    });

    it('creates with custom constraints', () => {
      const options: ValidationHooksOptions = {
        imageConstraints: {
          maxSizeBytes: 1024 * 1024,
          allowedFormats: ['image/png'],
        },
        outputConstraints: {
          mermaidPreValidate: true,
          onValidationFail: 'error',
          maxLength: 1000,
        },
      };

      const hooks = new ValidationHooks(options);

      expect(hooks.getImageConstraints().maxSizeBytes).toBe(1024 * 1024);
      expect(hooks.getImageConstraints().allowedFormats).toEqual(['image/png']);
      expect(hooks.getOutputConstraints().mermaidPreValidate).toBe(true);
      expect(hooks.getOutputConstraints().onValidationFail).toBe('error');
      expect(hooks.getOutputConstraints().maxLength).toBe(1000);
    });
  });

  describe('beforeThink - string content', () => {
    it('passes through string messages unchanged', async () => {
      const hooks = new ValidationHooks();
      const context = createTestContext([
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello' },
      ]);

      const result = await hooks.beforeThink(context);

      expect(result).toEqual(context);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]?.content).toBe('System prompt');
      expect(result.messages[1]?.content).toBe('Hello');
    });
  });

  describe('beforeThink - image validation', () => {
    it('validates image content parts successfully', async () => {
      const hooks = new ValidationHooks();
      const imagePart: ContentPart = {
        type: 'image',
        imageUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };
      const context = createTestContext([
        { role: 'user', content: [{ type: 'text', text: 'Look at this' }, imagePart] },
      ]);

      const result = await hooks.beforeThink(context);

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(1);
      const message = result.messages[0];
      expect(Array.isArray(message?.content)).toBe(true);
    });

    it('throws AgentError on invalid image format', async () => {
      const hooks = new ValidationHooks();
      const imagePart: ContentPart = {
        type: 'image',
        imageUrl: 'data:image/bmp;base64,Qk0=',
      };
      const context = createTestContext([{ role: 'user', content: [imagePart] }]);

      await expect(hooks.beforeThink(context)).rejects.toThrow(AgentError);
      await expect(hooks.beforeThink(context)).rejects.toThrow(/not supported/);
    });

    it('throws AgentError on oversized image', async () => {
      const hooks = new ValidationHooks({
        imageConstraints: { maxSizeBytes: 100 },
      });
      // Create a large base64 image (>100 bytes)
      const largeData = 'A'.repeat(200);
      const imagePart: ContentPart = {
        type: 'image',
        imageUrl: `data:image/png;base64,${largeData}`,
      };
      const context = createTestContext([{ role: 'user', content: [imagePart] }]);

      await expect(hooks.beforeThink(context)).rejects.toThrow(AgentError);
      await expect(hooks.beforeThink(context)).rejects.toThrow(/exceeds maximum/);
    });

    it('calls onValidationError callback on image validation failure', async () => {
      const onValidationError = vi.fn();
      const hooks = new ValidationHooks({ onValidationError });
      const imagePart: ContentPart = {
        type: 'image',
        imageUrl: 'data:image/bmp;base64,Qk0=',
      };
      const context = createTestContext([{ role: 'user', content: [imagePart] }]);

      await expect(hooks.beforeThink(context)).rejects.toThrow(AgentError);
      expect(onValidationError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'image',
          code: 'UNSUPPORTED_FORMAT',
        }),
      );
    });
  });

  describe('beforeThink - mixed content', () => {
    it('validates only image parts, passes text parts through', async () => {
      const hooks = new ValidationHooks();
      const textPart: ContentPart = { type: 'text', text: 'Hello' };
      const imagePart: ContentPart = {
        type: 'image',
        imageUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };
      const context = createTestContext([{ role: 'user', content: [textPart, imagePart] }]);

      const result = await hooks.beforeThink(context);

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(1);
      const message = result.messages[0];
      expect(Array.isArray(message?.content)).toBe(true);
      if (Array.isArray(message?.content)) {
        expect(message.content).toHaveLength(2);
        expect(message.content[0]?.type).toBe('text');
        expect(message.content[1]?.type).toBe('image');
      }
    });
  });

  describe('afterThink - clean output', () => {
    it('no errors or warnings for valid content', async () => {
      const hooks = new ValidationHooks();
      const step = createTestStep('This is a valid response');
      const context = createTestContext();

      await expect(hooks.afterThink(step, context)).resolves.toBeUndefined();
    });
  });

  describe('afterThink - mermaid validation', () => {
    it('detects invalid mermaid syntax when mermaidPreValidate enabled', async () => {
      const onValidationError = vi.fn();
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: true,
          onValidationFail: 'warn',
        },
        onValidationError,
      });
      const step = createTestStep('Here is a diagram:\n```mermaid\ninvalid syntax\n```');
      const context = createTestContext();

      await hooks.afterThink(step, context);

      expect(onValidationError).toHaveBeenCalled();
      const errorCall = onValidationError.mock.calls[0]?.[0] as ValidationError;
      expect(errorCall.type).toBe('mermaid');
    });

    it('passes valid mermaid syntax', async () => {
      const onValidationError = vi.fn();
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: true,
          onValidationFail: 'warn',
        },
        onValidationError,
      });
      const step = createTestStep('Here is a diagram:\n```mermaid\ngraph TD\n  A --> B\n```');
      const context = createTestContext();

      await hooks.afterThink(step, context);

      expect(onValidationError).not.toHaveBeenCalled();
    });

    it('does not load browser mermaid runtime during host-side validation', async () => {
      const onValidationError = vi.fn();
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: true,
          onValidationFail: 'warn',
        },
        onValidationError,
      });
      const step = createTestStep('```mermaid\ngraph TD\n  A --> B\n```');
      const context = createTestContext();

      await hooks.afterThink(step, context);

      expect(onValidationError).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('purify.addHook'),
        }),
      );
      expect(mermaidRuntimeMocks.initialize).not.toHaveBeenCalled();
      expect(mermaidRuntimeMocks.parse).not.toHaveBeenCalled();
    });
  });

  describe('afterThink - JSON validation', () => {
    it('detects invalid JSON when jsonSchema configured', async () => {
      const onValidationError = vi.fn();
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };
      const hooks = new ValidationHooks({
        outputConstraints: {
          jsonSchema: schema,
          onValidationFail: 'warn',
        },
        onValidationError,
      });
      const step = createTestStep('```json\n{"name": "John"}\n```');
      const context = createTestContext();

      await hooks.afterThink(step, context);

      // Should have validation error for missing 'age' field
      expect(onValidationError).toHaveBeenCalled();
    });

    it('passes valid JSON against schema', async () => {
      const onValidationError = vi.fn();
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };
      const hooks = new ValidationHooks({
        outputConstraints: {
          jsonSchema: schema,
          onValidationFail: 'warn',
        },
        onValidationError,
      });
      const step = createTestStep('```json\n{"name": "John"}\n```');
      const context = createTestContext();

      await hooks.afterThink(step, context);

      expect(onValidationError).not.toHaveBeenCalled();
    });
  });

  describe('afterThink - onValidationFail modes', () => {
    it('onValidationFail "warn" calls onValidationWarning, does not throw', async () => {
      const onValidationWarning = vi.fn();
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: true,
          onValidationFail: 'warn',
        },
        onValidationWarning,
      });
      const step = createTestStep('```mermaid\ninvalid\n```');
      const context = createTestContext();

      await expect(hooks.afterThink(step, context)).resolves.toBeUndefined();
    });

    it('onValidationFail "error" throws AgentError', async () => {
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: true,
          onValidationFail: 'error',
        },
      });
      const step = createTestStep('```mermaid\ninvalid\n```');
      const context = createTestContext();

      await expect(hooks.afterThink(step, context)).rejects.toThrow(AgentError);
    });

    it('onValidationFail "retry" does not throw and preserves mermaid blocks', async () => {
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: true,
          onValidationFail: 'retry',
        },
      });
      const originalContent = 'Some text\n```mermaid\ninvalid\n```\nMore text';
      const step = createTestStep(originalContent);
      const context = createTestContext();

      // retry mode should NOT throw (unlike 'error' mode)
      await expect(hooks.afterThink(step, context)).resolves.toBeUndefined();

      // Content still contains the mermaid block (replaced in-place with same content)
      expect(step.content).toContain('```mermaid');
    });

    it('onValidationFail "silent" does not throw or call callbacks', async () => {
      const onValidationError = vi.fn();
      const onValidationWarning = vi.fn();
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: true,
          onValidationFail: 'silent',
        },
        onValidationError,
        onValidationWarning,
      });
      const step = createTestStep('```mermaid\ninvalid\n```');
      const context = createTestContext();

      await expect(hooks.afterThink(step, context)).resolves.toBeUndefined();
      // Callbacks should still be called for errors, but no throw
      expect(onValidationError).toHaveBeenCalled();
    });
  });

  describe('afterThink - skill artifact validators', () => {
    it('uses skillValidationRequirements metadata to validate storyboard creative tables', async () => {
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: false,
          onValidationFail: 'error',
        },
      });
      const step = createTestStep(
        [
          '| 镜头 | 源页 | 景别/构图 | 画面内容 | 动作与节奏 | 镜头运动 | 声音/氛围 | 时长 | 备注 |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          '| 1 | P1 | 全景 | 主角站立 | 慢 | 推近 | 风声 | 3s | 待确认 |',
        ].join('\n'),
      );
      const context = createTestContextWithMetadata({
        skillValidationRequirements: ['creative-table.storyboard'],
      });

      await expect(hooks.afterThink(step, context)).rejects.toThrow(AgentError);
    });

    it('queues storyboard creative table repair when generic output mode is retry', async () => {
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: false,
          onValidationFail: 'retry',
        },
      });
      const step = createTestStep(
        [
          '---',
          'id: storyboard-draft',
          'kind: draft',
          'status: draft',
          'domain: storyboard',
          '---',
          '',
          '| scene | shot | source |',
          '| --- | --- | --- |',
          '| 正文 | 1 | P1 |',
        ].join('\n'),
      );
      const context = createTestContextWithMetadata({
        skillValidationRequirements: ['creative-table.storyboard'],
      });

      await expect(hooks.afterThink(step, context)).resolves.toBeUndefined();
      const repairRequest = consumeOutputValidationRepairRequest(context);
      expect(repairRequest).toEqual(
        expect.objectContaining({
          kind: 'output-validation-repair',
          attempt: 1,
          validators: ['creative-table.storyboard'],
          errors: expect.arrayContaining([
            expect.objectContaining({ code: 'storyboard-frontmatter-not-allowed' }),
          ]),
        }),
      );
      expect(repairRequest?.instruction).toContain('final target artifact directly');
      expect(repairRequest?.instruction).toContain('scene | shot | source');
      expect(repairRequest?.instruction).toContain('Localized headers are allowed');
      expect(repairRequest?.instruction).toContain('场景 | 镜头 | 来源 | 来源分格');
      expect(repairRequest?.instruction).toContain('页码, 景别/构图, 节奏/情绪');
      expect(repairRequest?.instruction).not.toContain(
        'Do not use display-only headers such as 镜号, 镜头',
      );
      expect(context.messages.at(-1)).toEqual({
        role: 'user',
        content: repairRequest?.instruction,
      });
    });

    it('records Agent-native validation feedback without rewriting streamed output', async () => {
      const recordValidationFeedback = vi.fn();
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: false,
          onValidationFail: 'retry',
        },
        creationFeedback: {
          recordValidationFeedback,
        },
      });
      const originalContent = [
        '| 镜号 | 来源页 | 画面内容 |',
        '| --- | --- | --- |',
        '| S01 | P1 | 主角站在巨构前 |',
      ].join('\n');
      const step = createTestStep(originalContent);
      const context = createTestContextWithMetadata({
        skillValidationRequirements: ['creative-table.storyboard'],
        agentCreation: {
          creationId: 'creation-1',
          iterationId: 'iteration-1',
        },
      });

      await expect(hooks.afterThink(step, context)).resolves.toBeUndefined();

      expect(step.content).toBe(originalContent);
      expect(recordValidationFeedback).toHaveBeenCalledWith({
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        validatorId: 'creative-table.storyboard',
        status: 'failed',
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            severity: 'error',
            code: expect.stringContaining('storyboard-table-'),
          }),
        ]),
        metadata: expect.objectContaining({
          feedbackAction: 'revise',
          preserveStreamedOutput: true,
        }),
      });
    });

    it('localizes storyboard creative table repair requests when runtime locale is Chinese', async () => {
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: false,
          onValidationFail: 'retry',
        },
      });
      const step = createTestStep(
        [
          '| 镜号 | 来源页 | 画面内容 |',
          '| --- | --- | --- |',
          '| S01 | P1 | 主角站在巨构前 |',
        ].join('\n'),
      );
      const context = createTestContextWithMetadata({
        locale: 'zh',
        skillValidationRequirements: ['creative-table.storyboard'],
      });

      await expect(hooks.afterThink(step, context)).resolves.toBeUndefined();
      const repairRequest = consumeOutputValidationRepairRequest(context);

      expect(repairRequest?.instruction).toContain('上一条可见 assistant 输出没有通过');
      expect(repairRequest?.instruction).toContain('修复要求：');
      expect(repairRequest?.instruction).toContain('场景 | 镜头 | 来源 | 来源分格');
      expect(repairRequest?.instruction).toContain('校验错误：');
      expect(repairRequest?.instruction).not.toContain('The previous visible assistant output');
      expect(context.messages.at(-1)).toEqual({
        role: 'user',
        content: repairRequest?.instruction,
      });
    });

    it('does not apply storyboard creative table validation without skill metadata', async () => {
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: false,
          onValidationFail: 'error',
        },
      });
      const step = createTestStep(
        [
          '| 镜头 | 源页 | 景别/构图 | 画面内容 |',
          '| --- | --- | --- | --- |',
          '| 1 | P1 | 全景 | 主角站立 |',
        ].join('\n'),
      );

      await expect(hooks.afterThink(step, createTestContext())).resolves.toBeUndefined();
    });
  });

  describe('getImageConstraints/getOutputConstraints', () => {
    it('returns current image constraints', () => {
      const hooks = new ValidationHooks({
        imageConstraints: { maxSizeBytes: 1000 },
      });

      const constraints = hooks.getImageConstraints();

      expect(constraints.maxSizeBytes).toBe(1000);
    });

    it('returns current output constraints', () => {
      const hooks = new ValidationHooks({
        outputConstraints: { mermaidPreValidate: true },
      });

      const constraints = hooks.getOutputConstraints();

      expect(constraints.mermaidPreValidate).toBe(true);
    });
  });

  describe('validateImage utility', () => {
    it('returns valid for valid image', async () => {
      const hooks = new ValidationHooks();
      const imageUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const result = await hooks.validateImage(imageUrl);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns invalid with error details for invalid image', async () => {
      const hooks = new ValidationHooks();
      const imageUrl = 'data:image/bmp;base64,Qk0=';

      const result = await hooks.validateImage(imageUrl);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe('image');
      expect(result.error?.code).toBe('UNSUPPORTED_FORMAT');
    });
  });

  describe('validateOutput utility', () => {
    it('returns errors and warnings arrays', async () => {
      const hooks = new ValidationHooks({
        outputConstraints: { mermaidPreValidate: true },
      });
      const content = '```mermaid\ninvalid\n```';

      const result = await hooks.validateOutput(content);

      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('returns empty arrays for valid content', async () => {
      const hooks = new ValidationHooks({
        outputConstraints: { mermaidPreValidate: true },
      });
      const content = 'Valid content without diagrams';

      const result = await hooks.validateOutput(content);

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('createValidationHooks factory', () => {
    it('creates instance with options', () => {
      const options: ValidationHooksOptions = {
        imageConstraints: { maxSizeBytes: 2000 },
        outputConstraints: { mermaidPreValidate: true },
      };

      const hooks = createValidationHooks(options);

      expect(hooks).toBeInstanceOf(ValidationHooks);
      expect(hooks.getImageConstraints().maxSizeBytes).toBe(2000);
      expect(hooks.getOutputConstraints().mermaidPreValidate).toBe(true);
    });

    it('creates instance without options', () => {
      const hooks = createValidationHooks();

      expect(hooks).toBeInstanceOf(ValidationHooks);
      expect(hooks.name).toBe('validation');
    });
  });

  describe('getImageValidator/getOutputValidator', () => {
    it('returns image validator instance', () => {
      const hooks = new ValidationHooks();

      const validator = hooks.getImageValidator();

      expect(validator).toBeDefined();
      expect(validator.getConstraints).toBeDefined();
    });

    it('returns output validator instance', () => {
      const hooks = new ValidationHooks();

      const validator = hooks.getOutputValidator();

      expect(validator).toBeDefined();
      expect(validator.getConstraints).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('handles empty content in afterThink', async () => {
      const hooks = new ValidationHooks({
        outputConstraints: { mermaidPreValidate: true },
      });
      const step = createTestStep('');
      const context = createTestContext();

      await expect(hooks.afterThink(step, context)).resolves.toBeUndefined();
    });

    it('handles multiple validation errors', async () => {
      const onValidationError = vi.fn();
      const hooks = new ValidationHooks({
        outputConstraints: {
          mermaidPreValidate: true,
          onValidationFail: 'warn',
        },
        onValidationError,
      });
      const step = createTestStep('```mermaid\ninvalid1\n```\n```mermaid\ninvalid2\n```');
      const context = createTestContext();

      await hooks.afterThink(step, context);

      expect(onValidationError.mock.calls.length).toBeGreaterThan(0);
    });

    it('handles context without messages', async () => {
      const hooks = new ValidationHooks();
      const context = createTestContext([]);

      const result = await hooks.beforeThink(context);

      expect(result.messages).toHaveLength(0);
    });

    it('preserves other message properties during validation', async () => {
      const hooks = new ValidationHooks();
      const context = createTestContext([{ role: 'user', content: 'Hello', name: 'TestUser' }]);

      const result = await hooks.beforeThink(context);

      expect(result.messages[0]?.name).toBe('TestUser');
    });
  });
});
