/**
 * Script Commands
 * Commands for script editing with AI assistance in text editors
 */

import * as vscode from 'vscode';
import type { ChatViewProvider } from '../chat/chatProvider';

/**
 * Get selected text or document content from active editor
 */
function getEditorText(): { text: string; hasSelection: boolean } | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }

  const selection = editor.selection;
  if (!selection.isEmpty) {
    return {
      text: editor.document.getText(selection),
      hasSelection: true,
    };
  }

  // Return entire document content
  return {
    text: editor.document.getText(),
    hasSelection: false,
  };
}

/**
 * Register script-related commands
 */
export function registerScriptCommands(
  context: vscode.ExtensionContext,
  chatProvider: ChatViewProvider
): void {
  // Generate Script - Create script from topic/outline
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generate', async () => {
      const editorText = getEditorText();

      let prompt: string;
      if (editorText?.hasSelection && editorText.text.trim()) {
        // Use selected text as topic/outline
        prompt = `请根据以下主题/大纲生成一个完整的视频脚本：\n\n${editorText.text}`;
      } else if (editorText?.text.trim()) {
        // Use document content as context
        prompt = `请根据以下内容生成一个完整的视频脚本：\n\n${editorText.text}`;
      } else {
        // Ask user for topic
        const topic = await vscode.window.showInputBox({
          prompt: '请输入脚本主题或大纲',
          placeHolder: '例如：介绍人工智能的发展历史',
        });
        if (!topic) return;
        prompt = `请生成一个关于"${topic}"的视频脚本`;
      }

      await chatProvider.sendMessageToAssistant(prompt);
    })
  );

  // Optimize Script - Improve existing script
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.optimize', async () => {
      const editorText = getEditorText();

      if (!editorText?.text.trim()) {
        vscode.window.showWarningMessage('请先选择或打开要优化的脚本内容');
        return;
      }

      // Ask for optimization type
      const optimizationType = await vscode.window.showQuickPick([
        { label: '全面优化', description: '提升整体质量、结构和表达', value: 'comprehensive' },
        { label: '增强吸引力', description: '使内容更加引人入胜', value: 'engagement' },
        { label: '精简内容', description: '删减冗余，保留精华', value: 'brevity' },
        { label: '提升清晰度', description: '使表达更清晰易懂', value: 'clarity' },
        { label: 'SEO优化', description: '优化关键词和搜索排名', value: 'seo' },
      ], {
        placeHolder: '选择优化类型',
      });

      if (!optimizationType) return;

      const prompt = `请${optimizationType.label}以下脚本内容（${optimizationType.description}）：\n\n${editorText.text}`;
      await chatProvider.sendMessageToAssistant(prompt);
    })
  );

  // Generate Image from Script - Use selected text as prompt
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateImage', async () => {
      const editorText = getEditorText();

      let imagePrompt: string;
      if (editorText?.hasSelection && editorText.text.trim()) {
        imagePrompt = editorText.text;
      } else {
        // Ask user for prompt
        const userPrompt = await vscode.window.showInputBox({
          prompt: '请输入图片描述',
          placeHolder: '例如：一只可爱的小猫，阳光下玩耍',
        });
        if (!userPrompt) return;
        imagePrompt = userPrompt;
      }

      const prompt = `请根据以下描述生成一张图片：${imagePrompt}`;
      await chatProvider.sendMessageToAssistant(prompt);
    })
  );

  // Generate Video from Script - Use selected text as prompt
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateVideo', async () => {
      const editorText = getEditorText();

      let videoPrompt: string;
      if (editorText?.hasSelection && editorText.text.trim()) {
        videoPrompt = editorText.text;
      } else {
        // Ask user for prompt
        const userPrompt = await vscode.window.showInputBox({
          prompt: '请输入视频描述',
          placeHolder: '例如：海浪轻轻拍打沙滩，日落时分',
        });
        if (!userPrompt) return;
        videoPrompt = userPrompt;
      }

      const prompt = `请根据以下描述生成一段视频：${videoPrompt}`;
      await chatProvider.sendMessageToAssistant(prompt);
    })
  );
}
