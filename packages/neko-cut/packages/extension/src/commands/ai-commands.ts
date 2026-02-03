/**
 * AI Commands
 * VSCode commands for AI generation, analysis, and document tools
 */

import * as vscode from 'vscode';
import type {
  AIGenerationService,
  VisionAnalysisService,
  DocumentGenerationService,
} from '@uniedit/platform';
import { ToolRegistry } from '@uniedit/agent';

// AI Services (to be set when available)
let aiGenerationService: AIGenerationService | null = null;
let visionAnalysisService: VisionAnalysisService | null = null;
let documentGenerationService: DocumentGenerationService | null = null;

/**
 * Set AI generation service
 */
export function setAIGenerationService(service: AIGenerationService): void {
  aiGenerationService = service;
}

/**
 * Set vision analysis service
 */
export function setVisionAnalysisService(service: VisionAnalysisService): void {
  visionAnalysisService = service;
}

/**
 * Set document generation service
 */
export function setDocumentGenerationService(service: DocumentGenerationService): void {
  documentGenerationService = service;
}

/**
 * Register AI-related VSCode commands
 */
export function registerAICommands(
  context: vscode.ExtensionContext,
  toolRegistry: ToolRegistry
): void {
  // ==================== AI Generation Commands ====================

  // Generate Image
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.generateImage', async (params: {
      prompt: string;
      size?: string;
      quality?: 'standard' | 'hd';
      style?: 'natural' | 'vivid';
    }) => {
      const tool = toolRegistry.get('generate_image');
      if (!tool) {
        vscode.window.showErrorMessage('Image generation tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Generate Video
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.generateVideo', async (params: {
      prompt: string;
      duration?: number;
      resolution?: string;
      fps?: number;
    }) => {
      const tool = toolRegistry.get('generate_video');
      if (!tool) {
        vscode.window.showErrorMessage('Video generation tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Generate TTS
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.generateTTS', async (params: {
      text: string;
      voice?: string;
      language?: string;
      speed?: number;
    }) => {
      const tool = toolRegistry.get('generate_tts');
      if (!tool) {
        vscode.window.showErrorMessage('TTS generation tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Generate Music
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.generateMusic', async (params: {
      prompt: string;
      duration?: number;
      genre?: string;
      mood?: string;
    }) => {
      const tool = toolRegistry.get('generate_music');
      if (!tool) {
        vscode.window.showErrorMessage('Music generation tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Generate Character
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.generateCharacter', async (params: {
      prompt: string;
      referenceImageUrl?: string;
      style?: string;
      pose?: string;
      expression?: string;
    }) => {
      const tool = toolRegistry.get('generate_character');
      if (!tool) {
        vscode.window.showErrorMessage('Character generation tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Transfer Style
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.transferStyle', async (params: {
      sourceImageUrl: string;
      stylePrompt: string;
      styleStrength?: number;
    }) => {
      const tool = toolRegistry.get('transfer_style');
      if (!tool) {
        vscode.window.showErrorMessage('Style transfer tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Enhance Video
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.enhanceVideo', async (params: {
      videoUrl: string;
      targetResolution?: string;
      denoise?: boolean;
      stabilize?: boolean;
      interpolateFps?: number;
    }) => {
      const tool = toolRegistry.get('enhance_video');
      if (!tool) {
        vscode.window.showErrorMessage('Video enhancement tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Optimize Audio
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.optimizeAudio', async (params: {
      audioUrl: string;
      denoise?: boolean;
      normalize?: boolean;
      enhanceVoice?: boolean;
      removeBackground?: boolean;
    }) => {
      const tool = toolRegistry.get('optimize_audio');
      if (!tool) {
        vscode.window.showErrorMessage('Audio optimization tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // ==================== AI Analysis Commands ====================

  // Analyze Image
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.analyzeImage', async (params: {
      imageId: string;
      analysisType?: 'description' | 'objects' | 'text' | 'faces' | 'colors' | 'composition';
      prompt?: string;
    }) => {
      const tool = toolRegistry.get('AnalyzeImage');
      if (!tool) {
        vscode.window.showErrorMessage('Image analysis tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Extract Image Text (OCR)
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.extractImageText', async (params: {
      imageId: string;
      language?: string;
    }) => {
      const tool = toolRegistry.get('ExtractImageText');
      if (!tool) {
        vscode.window.showErrorMessage('OCR tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Analyze Video
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.analyzeVideo', async (params: {
      videoId: string;
      analysisType?: 'description' | 'scene-detection' | 'action' | 'summary';
      sampleInterval?: number;
    }) => {
      const tool = toolRegistry.get('AnalyzeVideo');
      if (!tool) {
        vscode.window.showErrorMessage('Video analysis tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Extract Video Summary
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.extractVideoSummary', async (params: {
      videoId: string;
      maxLength?: number;
    }) => {
      const tool = toolRegistry.get('ExtractVideoSummary');
      if (!tool) {
        vscode.window.showErrorMessage('Video summary tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // ==================== Document Commands ====================

  // Generate Script
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.generateScript', async (params: {
      topic: string;
      style?: 'professional' | 'casual' | 'educational' | 'promotional';
      length?: string;
      language?: string;
    }) => {
      const tool = toolRegistry.get('GenerateScript');
      if (!tool) {
        vscode.window.showErrorMessage('Script generation tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Optimize Script
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.optimizeScript', async (params: {
      scriptText: string;
      optimizationType?: 'engagement' | 'clarity' | 'brevity' | 'seo' | 'accessibility';
    }) => {
      const tool = toolRegistry.get('OptimizeScript');
      if (!tool) {
        vscode.window.showErrorMessage('Script optimization tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Generate Storyboard
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.generateStoryboard', async (params: {
      scriptText: string;
      numScenes?: number;
      style?: 'realistic' | 'cartoon' | 'sketch' | 'minimal';
    }) => {
      const tool = toolRegistry.get('GenerateStoryboard');
      if (!tool) {
        vscode.window.showErrorMessage('Storyboard generation tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );

  // Generate Subtitles
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.ai.generateSubtitles', async (params: {
      mediaId: string;
      language?: string;
      maxCharsPerLine?: number;
    }) => {
      const tool = toolRegistry.get('GenerateSubtitles');
      if (!tool) {
        vscode.window.showErrorMessage('Subtitle generation tool not available.');
        return;
      }
      const result = await tool.execute(params);
      return result;
    })
  );
}
