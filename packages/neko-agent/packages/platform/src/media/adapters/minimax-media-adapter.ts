/**
 * MiniMax Media Adapter
 *
 * Supports MiniMax video generation API
 */

import type { Model, Provider } from '../../types/provider';
import type {
  MediaGenerationType,
  MediaAdapterResult,
  VideoGenerationRequest,
  MediaOutput,
} from '../types';
import { BaseMediaAdapter } from './base-media-adapter';

/**
 * MiniMax API response types
 */
interface MiniMaxVideoResponse {
  task_id: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

interface MiniMaxTaskStatusResponse {
  task_id: string;
  status: 'Queueing' | 'Processing' | 'Success' | 'Fail';
  file_id?: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

interface MiniMaxFileResponse {
  file: {
    file_id: string;
    bytes: number;
    created_at: number;
    filename: string;
    purpose: string;
    download_url: string;
  };
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

/**
 * MiniMax media adapter
 */
export class MiniMaxMediaAdapter extends BaseMediaAdapter {
  readonly type = 'minimax';

  getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-video'];
  }

  /**
   * Generate video using MiniMax API
   */
  async generateVideo(
    request: VideoGenerationRequest,
    model: Model,
    provider: Provider
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/v1/video_generation`;

    const body: Record<string, unknown> = {
      model: model.name || 'video-01',
      prompt: request.prompt,
    };

    const { data, error } = await this.request<MiniMaxVideoResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.base_resp.status_code !== 0) {
      return {
        status: 'failed',
        error: {
          code: 'API_ERROR',
          message: data?.base_resp.status_msg || 'Unknown error',
          retryable: false,
        },
      };
    }

    return {
      externalTaskId: data?.task_id,
      status: 'pending',
      progress: 0,
    };
  }

  /**
   * Get task status
   */
  async getTaskStatus(
    externalTaskId: string,
    provider: Provider
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/v1/query/video_generation?task_id=${externalTaskId}`;

    const { data, error } = await this.request<MiniMaxTaskStatusResponse>(
      url,
      { method: 'GET' },
      provider
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.base_resp.status_code !== 0) {
      return {
        status: 'failed',
        error: {
          code: 'API_ERROR',
          message: data?.base_resp.status_msg || 'Unknown error',
          retryable: false,
        },
      };
    }

    const status = this.mapStatus(data?.status);

    // If completed, get the download URL
    if (status === 'completed' && data?.file_id) {
      const outputs = await this.getFileUrl(data.file_id, provider);
      return {
        externalTaskId,
        status,
        progress: 100,
        outputs,
      };
    }

    return {
      externalTaskId,
      status,
      progress: this.estimateProgress(data?.status),
    };
  }

  /**
   * Get file download URL
   */
  private async getFileUrl(
    fileId: string,
    provider: Provider
  ): Promise<MediaOutput[] | undefined> {
    const url = `${provider.apiUrl}/v1/files/retrieve?file_id=${fileId}`;

    const { data, error } = await this.request<MiniMaxFileResponse>(
      url,
      { method: 'GET' },
      provider
    );

    if (error || data?.base_resp.status_code !== 0) {
      return undefined;
    }

    return [
      {
        type: 'video',
        url: data.file.download_url,
        fileSize: data.file.bytes,
        mimeType: 'video/mp4',
      },
    ];
  }

  /**
   * Cancel a running task
   */
  async cancelTask(_externalTaskId: string, _provider: Provider): Promise<void> {
    // MiniMax does not support task cancellation
  }

  /**
   * Map MiniMax status to our status
   */
  private mapStatus(
    status?: string
  ): 'pending' | 'processing' | 'completed' | 'failed' {
    switch (status) {
      case 'Queueing':
        return 'pending';
      case 'Processing':
        return 'processing';
      case 'Success':
        return 'completed';
      case 'Fail':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Estimate progress from status
   */
  private estimateProgress(status?: string): number {
    switch (status) {
      case 'Queueing':
        return 0;
      case 'Processing':
        return 50;
      case 'Success':
        return 100;
      case 'Fail':
        return 0;
      default:
        return 0;
    }
  }
}
