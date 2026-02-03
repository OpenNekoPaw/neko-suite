/**
 * Frame Decode Worker
 *
 * 在 Web Worker 中进行 JPEG 解码，避免阻塞主线程
 */

// Message types
interface DecodeRequest {
	type: 'decode';
	id: number;
	data: ArrayBuffer;
}

interface DecodeResponse {
	type: 'decoded';
	id: number;
	bitmap: ImageBitmap;
	decodeTimeMs: number;
}

interface ErrorResponse {
	type: 'error';
	id: number;
	error: string;
}

type WorkerMessage = DecodeRequest;
type WorkerResponse = DecodeResponse | ErrorResponse;

// Worker context
const ctx: Worker = self as unknown as Worker;

// Handle messages
ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;

	if (message.type === 'decode') {
		const startTime = performance.now();

		try {
			// Create blob from ArrayBuffer
			const blob = new Blob([message.data], { type: 'image/jpeg' });

			// Decode to ImageBitmap (hardware accelerated)
			const bitmap = await createImageBitmap(blob, {
				// Use default color space conversion for best performance
				colorSpaceConversion: 'default',
				// Prefer low quality for preview (faster)
				resizeQuality: 'low',
			});

			const decodeTimeMs = performance.now() - startTime;

			// Send back the bitmap (transferable)
			const response: DecodeResponse = {
				type: 'decoded',
				id: message.id,
				bitmap,
				decodeTimeMs,
			};

			ctx.postMessage(response, [bitmap]);
		} catch (error) {
			const response: ErrorResponse = {
				type: 'error',
				id: message.id,
				error: error instanceof Error ? error.message : String(error),
			};

			ctx.postMessage(response);
		}
	}
};

// Export for TypeScript
export type { WorkerMessage, WorkerResponse, DecodeRequest, DecodeResponse, ErrorResponse };
