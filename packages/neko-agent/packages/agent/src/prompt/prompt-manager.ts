/**
 * Prompt Manager - Prompt template management
 *
 * Manages prompt templates for agent interactions:
 * - Template registration and retrieval
 * - Variable substitution
 * - Chain prompt execution
 */

import type {
  Prompt,
  PromptVariable,
  PromptCategory,
  RenderedPrompt,
  IPromptManager,
  ChainPrompt,
  ChainPromptStep,
} from '@uniedit/shared';

/**
 * Chain execution result
 */
export interface ChainExecutionResult {
  /** Final output */
  output: unknown;
  /** Results from each step */
  stepResults: Map<string, unknown>;
  /** Total execution time in ms */
  executionTime: number;
}

/**
 * Chain execution options
 */
export interface ChainExecutionOptions {
  /** Initial variables */
  variables?: Record<string, unknown>;
  /** Callback for each step completion */
  onStepComplete?: (step: string, result: unknown) => void;
  /** Maximum steps to execute */
  maxSteps?: number;
}

/**
 * Step executor function type
 */
export type StepExecutor = (prompt: string) => Promise<string>;

/**
 * Prompt manager implementation
 */
export class PromptManager implements IPromptManager {
  private prompts: Map<string, Prompt> = new Map();

  constructor() {
    this.registerBuiltinPrompts();
  }

  /**
   * List all prompts
   */
  list(): Prompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * List prompts by category
   */
  listByCategory(category: PromptCategory): Prompt[] {
    return this.list().filter((p) => p.category === category);
  }

  /**
   * Get prompt by ID
   */
  get(id: string): Prompt | undefined {
    return this.prompts.get(id);
  }

  /**
   * Render prompt with variables
   */
  render(id: string, variables: Record<string, unknown>): RenderedPrompt {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      throw new Error(`Prompt '${id}' not found`);
    }

    const warnings: string[] = [];
    let content = prompt.template;

    // Check for missing required variables
    for (const varDef of prompt.variables) {
      const value = variables[varDef.name];

      if (value === undefined || value === null) {
        if (varDef.required && varDef.default === undefined) {
          warnings.push(`Missing required variable: ${varDef.name}`);
        }
      }
    }

    // Substitute variables
    content = content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const varDef = prompt.variables.find((v) => v.name === varName);
      let value = variables[varName];

      if (value === undefined || value === null) {
        if (varDef?.default !== undefined) {
          value = varDef.default;
        } else {
          return match; // Keep placeholder if no value
        }
      }

      return this.formatValue(value, varDef?.type || 'string');
    });

    return {
      content,
      variables,
      warnings,
    };
  }

  /**
   * Register a prompt
   */
  register(prompt: Prompt): void {
    this.prompts.set(prompt.id, prompt);
  }

  /**
   * Unregister a prompt
   */
  unregister(id: string): void {
    this.prompts.delete(id);
  }

  /**
   * Check if a prompt exists
   */
  has(id: string): boolean {
    return this.prompts.has(id);
  }

  /**
   * Get prompt count
   */
  get size(): number {
    return this.prompts.size;
  }

  /**
   * Clear all prompts
   */
  clear(): void {
    this.prompts.clear();
  }

  private formatValue(value: unknown, type: string): string {
    switch (type) {
      case 'string':
        return String(value);
      case 'number':
        return String(value);
      case 'boolean':
        return value ? 'true' : 'false';
      case 'object':
      case 'array':
        return JSON.stringify(value, null, 2);
      default:
        return String(value);
    }
  }

  private registerBuiltinPrompts(): void {
    // System prompt for video editor
    this.register({
      id: 'system-video-editor',
      name: 'Video Editor System',
      description: 'System prompt for video editing assistant',
      category: 'system',
      template: `You are an AI assistant specialized in video editing. You help users create and edit videos using a timeline-based editor.

Available tools allow you to:
- Add, remove, and modify tracks and elements
- Apply effects and transitions
- Generate media content
- Analyze and process video/audio

Current project context:
{{projectContext}}

Always provide clear explanations of what you're doing and ask for clarification when needed.`,
      variables: [
        {
          name: 'projectContext',
          description: 'Current project state',
          type: 'string',
          required: false,
          default: 'No project loaded',
        },
      ],
      version: '1.0.0',
    });

    // JSON output format
    this.register({
      id: 'format-json-output',
      name: 'JSON Output Format',
      description: 'Prompt for structured JSON output',
      category: 'format',
      template: `Please respond with a valid JSON object following this schema:
{{schema}}

Do not include any text before or after the JSON. Only output the JSON object.`,
      variables: [
        {
          name: 'schema',
          description: 'JSON schema for output',
          type: 'object',
          required: true,
        },
      ],
      version: '1.0.0',
    });

    // Task planning
    this.register({
      id: 'task-planning',
      name: 'Task Planning',
      description: 'Prompt for planning multi-step tasks',
      category: 'chain',
      template: `Analyze the following request and break it down into steps:
{{request}}

For each step, identify:
1. What action needs to be taken
2. What tools or operations are required
3. Dependencies on other steps
4. Expected outcome

Respond with a structured plan.`,
      variables: [
        {
          name: 'request',
          description: 'User request to plan',
          type: 'string',
          required: true,
        },
      ],
      version: '1.0.0',
    });

    // Video analysis prompt
    this.register({
      id: 'analyze-video',
      name: 'Video Analysis',
      description: 'Analyze video content and structure',
      category: 'chain',
      template: `Analyze the following video information and provide insights:

Video Details:
{{videoInfo}}

Please provide:
1. Content summary
2. Key scenes or segments
3. Audio characteristics
4. Suggested improvements or edits`,
      variables: [
        {
          name: 'videoInfo',
          description: 'Video metadata and details',
          type: 'object',
          required: true,
        },
      ],
      version: '1.0.0',
    });

    // Subtitle generation prompt
    this.register({
      id: 'generate-subtitles',
      name: 'Subtitle Generation',
      description: 'Generate subtitles from transcript',
      category: 'chain',
      template: `Generate properly formatted subtitles from the following transcript:

Transcript:
{{transcript}}

Target language: {{language}}
Max characters per line: {{maxChars}}
Max duration per subtitle: {{maxDuration}} seconds

Format the output as a list of subtitle entries with start time, end time, and text.`,
      variables: [
        {
          name: 'transcript',
          description: 'Audio transcript',
          type: 'string',
          required: true,
        },
        {
          name: 'language',
          description: 'Target language',
          type: 'string',
          required: false,
          default: 'en',
        },
        {
          name: 'maxChars',
          description: 'Maximum characters per line',
          type: 'number',
          required: false,
          default: 42,
        },
        {
          name: 'maxDuration',
          description: 'Maximum duration per subtitle in seconds',
          type: 'number',
          required: false,
          default: 7,
        },
      ],
      version: '1.0.0',
    });

    // Effect suggestion prompt
    this.register({
      id: 'suggest-effects',
      name: 'Effect Suggestions',
      description: 'Suggest video effects based on content',
      category: 'chain',
      template: `Based on the following video content and mood, suggest appropriate effects:

Content Description:
{{contentDescription}}

Desired Mood: {{mood}}
Video Style: {{style}}

Suggest:
1. Color grading/filters
2. Transitions between scenes
3. Motion effects
4. Audio enhancements`,
      variables: [
        {
          name: 'contentDescription',
          description: 'Description of video content',
          type: 'string',
          required: true,
        },
        {
          name: 'mood',
          description: 'Desired mood (e.g., energetic, calm, dramatic)',
          type: 'string',
          required: false,
          default: 'neutral',
        },
        {
          name: 'style',
          description: 'Video style (e.g., vlog, documentary, cinematic)',
          type: 'string',
          required: false,
          default: 'general',
        },
      ],
      version: '1.0.0',
    });

    // Error correction prompt
    this.register({
      id: 'correct-timeline-error',
      name: 'Timeline Error Correction',
      description: 'Help correct timeline issues',
      category: 'user',
      template: `The user encountered a timeline error:

Error: {{errorMessage}}

Current timeline state:
{{timelineState}}

User action: {{userAction}}

Please analyze the issue and suggest how to:
1. Fix the current error
2. Prevent similar issues
3. Alternative approaches if the action cannot be completed`,
      variables: [
        {
          name: 'errorMessage',
          description: 'Error message from the system',
          type: 'string',
          required: true,
        },
        {
          name: 'timelineState',
          description: 'Current state of the timeline',
          type: 'object',
          required: true,
        },
        {
          name: 'userAction',
          description: 'What the user was trying to do',
          type: 'string',
          required: true,
        },
      ],
      version: '1.0.0',
    });
  }
}

/**
 * Chain prompt executor - executes multi-step prompt chains
 */
export class ChainPromptExecutor {
  private promptManager: PromptManager;
  private chains: Map<string, ChainPrompt> = new Map();

  constructor(promptManager: PromptManager) {
    this.promptManager = promptManager;
    this.registerBuiltinChains();
  }

  /**
   * Register a chain prompt
   */
  registerChain(chain: ChainPrompt): void {
    this.chains.set(chain.id, chain);
  }

  /**
   * Get a chain by ID
   */
  getChain(id: string): ChainPrompt | undefined {
    return this.chains.get(id);
  }

  /**
   * List all chains
   */
  listChains(): ChainPrompt[] {
    return Array.from(this.chains.values());
  }

  /**
   * Execute a chain prompt
   */
  async execute(
    chainId: string,
    executor: StepExecutor,
    options: ChainExecutionOptions = {}
  ): Promise<ChainExecutionResult> {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain '${chainId}' not found`);
    }

    const startTime = Date.now();
    const stepResults = new Map<string, unknown>();
    const maxSteps = options.maxSteps || 100;
    let currentVariables = { ...options.variables };

    for (let i = 0; i < chain.steps.length && i < maxSteps; i++) {
      const step = chain.steps[i];

      // Map variables from previous steps
      const stepVariables = { ...currentVariables };
      if (step.variableMappings) {
        for (const [target, source] of Object.entries(step.variableMappings)) {
          const [sourceStep, sourceKey] = source.split('.');
          const sourceResult = stepResults.get(sourceStep);
          if (sourceResult !== undefined) {
            if (sourceKey && typeof sourceResult === 'object') {
              stepVariables[target] = (sourceResult as Record<string, unknown>)[sourceKey];
            } else {
              stepVariables[target] = sourceResult;
            }
          }
        }
      }

      // Render and execute the prompt
      const rendered = this.promptManager.render(step.promptId, stepVariables);
      const result = await executor(rendered.content);

      // Transform output if needed
      let transformedResult: unknown = result;
      if (step.transform) {
        try {
          transformedResult = step.transform(result);
        } catch {
          // Keep raw result if transform fails
        }
      }

      stepResults.set(step.name, transformedResult);

      // Callback
      if (options.onStepComplete) {
        options.onStepComplete(step.name, transformedResult);
      }
    }

    // Get final output from last step
    const lastStep = chain.steps[chain.steps.length - 1];
    const output = stepResults.get(lastStep?.name) || null;

    return {
      output,
      stepResults,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Create a simple chain from prompt IDs
   */
  createSimpleChain(
    id: string,
    name: string,
    promptIds: string[],
    variableMappings?: Record<number, Record<string, string>>
  ): ChainPrompt {
    const steps: ChainPromptStep[] = promptIds.map((promptId, index) => ({
      name: `step_${index + 1}`,
      promptId,
      variableMappings: variableMappings?.[index],
    }));

    const chain: ChainPrompt = {
      id,
      name,
      description: `Chain of ${promptIds.length} prompts`,
      steps,
    };

    this.registerChain(chain);
    return chain;
  }

  private registerBuiltinChains(): void {
    // Video editing workflow chain
    this.registerChain({
      id: 'chain-video-edit-workflow',
      name: 'Video Edit Workflow',
      description: 'Complete video editing workflow from analysis to output',
      steps: [
        {
          name: 'analyze',
          promptId: 'analyze-video',
        },
        {
          name: 'plan',
          promptId: 'task-planning',
          variableMappings: {
            request: 'analyze.output',
          },
        },
        {
          name: 'effects',
          promptId: 'suggest-effects',
          variableMappings: {
            contentDescription: 'analyze.output',
          },
        },
      ],
    });

    // Subtitle generation chain
    this.registerChain({
      id: 'chain-subtitle-generation',
      name: 'Subtitle Generation Chain',
      description: 'Generate and format subtitles from audio',
      steps: [
        {
          name: 'generate',
          promptId: 'generate-subtitles',
          transform: (output: string) => {
            // Try to parse as JSON, otherwise return raw
            try {
              return JSON.parse(output);
            } catch {
              return output;
            }
          },
        },
      ],
    });
  }
}

/**
 * Create a prompt manager instance
 */
export function createPromptManager(): PromptManager {
  return new PromptManager();
}
