import * as vscode from 'vscode';
import type {
  AgentRunnerConfirmationRequest,
  AgentRunnerEventSource,
  AgentRunnerPortEvent,
} from '@neko/agent/runtime';
import type { SubAgentEvent } from '@neko/agent';

export class AgentRunnerVscodeEventBridge implements vscode.Disposable {
  private readonly onDidStartEmitter = new vscode.EventEmitter<void>();
  private readonly onDidStopEmitter = new vscode.EventEmitter<void>();
  private readonly onDidRequestConfirmationEmitter =
    new vscode.EventEmitter<AgentRunnerConfirmationRequest>();
  private readonly onDidSubAgentEventEmitter = new vscode.EventEmitter<SubAgentEvent>();
  private readonly runnerEventDisposable: { dispose(): void };

  constructor(onDidRunnerEvent: AgentRunnerEventSource<AgentRunnerPortEvent>) {
    this.runnerEventDisposable = onDidRunnerEvent((event) => this.forwardRunnerEvent(event));
  }

  get onDidStart(): vscode.Event<void> {
    return this.onDidStartEmitter.event;
  }

  get onDidStop(): vscode.Event<void> {
    return this.onDidStopEmitter.event;
  }

  get onDidRequestConfirmation(): vscode.Event<AgentRunnerConfirmationRequest> {
    return this.onDidRequestConfirmationEmitter.event;
  }

  get onDidSubAgentEvent(): vscode.Event<SubAgentEvent> {
    return this.onDidSubAgentEventEmitter.event;
  }

  dispose(): void {
    this.runnerEventDisposable.dispose();
    this.onDidStartEmitter.dispose();
    this.onDidStopEmitter.dispose();
    this.onDidRequestConfirmationEmitter.dispose();
    this.onDidSubAgentEventEmitter.dispose();
  }

  private forwardRunnerEvent(event: AgentRunnerPortEvent): void {
    switch (event.type) {
      case 'start':
        this.onDidStartEmitter.fire();
        return;
      case 'stop':
        this.onDidStopEmitter.fire();
        return;
      case 'confirmation':
        this.onDidRequestConfirmationEmitter.fire(event.request);
        return;
      case 'subagent':
        this.onDidSubAgentEventEmitter.fire(event.event);
        return;
      case 'cancel':
      case 'historyLoaded':
      case 'contextCompressed':
      case 'activationProgress':
        return;
    }
  }
}
