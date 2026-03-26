/**
 * Run Report Tools — Agent tools for querying pipeline execution reports
 *
 * Reads from the in-memory completedPipelines Map in pipelineTools.
 * No file persistence — reports live for 1 hour (matching retry TTL).
 */

import type { PipelineRunReport, StageRecord } from '@neko/agent/pipeline';
import type { Tool } from './extensionTools';
import { getPipelineReport, listPipelineReports } from './pipelineTools';

// =============================================================================
// Tool Factory
// =============================================================================

/**
 * Create pipeline report query tools.
 */
export function createRunReportTools(): Tool[] {
  const getReport: Tool = {
    name: 'GetPipelineReport',
    description:
      'Get a detailed execution report for a specific pipeline run. ' +
      'Returns per-stage status (success/failed/skipped), duration, error messages, ' +
      'and scene generation summary. Use this to diagnose pipeline failures.',
    parameters: {
      type: 'object',
      properties: {
        pipelineId: {
          type: 'string',
          description: 'Pipeline execution ID to look up',
        },
      },
      required: ['pipelineId'],
    },
    execute: async (args: Record<string, unknown>) => {
      const pipelineId = args['pipelineId'];
      if (typeof pipelineId !== 'string' || pipelineId.length === 0) {
        return { success: false, error: 'pipelineId is required' };
      }

      const report = getPipelineReport(pipelineId);
      if (!report) {
        return { success: false, error: `No report found for pipeline ${pipelineId}` };
      }

      return { success: true, data: formatReport(report) };
    },
  };

  const listReports: Tool = {
    name: 'ListPipelineReports',
    description:
      'List recent pipeline execution reports with summary (status, flow, duration, scene counts). ' +
      'Useful for understanding overall pipeline reliability and finding specific runs to inspect.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of reports to return (default 10)',
        },
      },
    },
    execute: async (args: Record<string, unknown>) => {
      const rawLimit = args['limit'];
      const limit = typeof rawLimit === 'number' && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;
      const reports = listPipelineReports(limit);

      return {
        success: true,
        data: {
          total: reports.length,
          reports: reports.map(formatReportSummary),
        },
      };
    },
  };

  return [getReport, listReports];
}

// =============================================================================
// Formatters
// =============================================================================

function formatReport(report: PipelineRunReport): Record<string, unknown> {
  const totalDurationMs = report.stages.reduce((sum, s) => sum + s.durationMs, 0);

  return {
    id: report.id,
    flowId: report.flowId,
    status: report.status,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    totalDurationMs,
    stages: report.stages.map(formatStageRecord),
    failedStageIndex: report.failedStageIndex,
    sceneSummary: report.sceneSummary,
  };
}

function formatReportSummary(report: PipelineRunReport): Record<string, unknown> {
  const totalDurationMs = report.stages.reduce((sum, s) => sum + s.durationMs, 0);
  const failedStage =
    report.failedStageIndex !== undefined
      ? report.stages[report.failedStageIndex]?.name
      : undefined;

  return {
    id: report.id,
    flowId: report.flowId,
    status: report.status,
    completedAt: report.completedAt,
    totalDurationMs,
    stageCount: report.stages.length,
    failedStage,
    sceneSummary: report.sceneSummary,
  };
}

function formatStageRecord(stage: StageRecord): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: stage.name,
    status: stage.status,
    durationMs: stage.durationMs,
  };
  if (stage.error) result['error'] = stage.error;
  if (stage.skipReason) result['skipReason'] = stage.skipReason;
  return result;
}
