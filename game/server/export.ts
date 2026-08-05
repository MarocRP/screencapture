import path from 'node:path';
import { mkdir } from 'node:fs/promises';

import { liveStreamStore, uploadStore } from './bootstrap';
import {
  CallbackFn,
  CaptureOptions,
  DataType,
  LiveStreamCallback,
  LiveStreamOptions,
  LiveStreamViewerGrant,
  ScreenshotBasicCallbackFn,
  StreamRemoteConfig,
  createScreenshotBasicUploadData,
  createRegularUploadData,
} from './types';
import { endLiveStream, getLiveStreamClient, provisionLiveStream } from './live';
import { exportHandler } from './utils';
import { nanoid } from 'nanoid';


const tempDir = path.join(GetResourcePath(GetCurrentResourceName()), 'tmp');
mkdir(tempDir, { recursive: true }).catch((err) => {
  console.error('[screencapture] Failed to create temp directory:', err);
});

function normalizeStreamOptions(options: CaptureOptions = {}, duration?: number): CaptureOptions {
  return {
    ...options,
    ...(duration !== undefined && options.duration === undefined && { duration }),
  };
}

function validateStreamRequest(source: number, options: CaptureOptions, exportName: string): boolean {
  if (!source) {
    console.error(`[screencapture] source is required for ${exportName}`);
    return false;
  }

  if (options.duration !== undefined && (!Number.isFinite(options.duration) || options.duration <= 0)) {
    console.error(`[screencapture] duration must be a positive number for ${exportName}`);
    return false;
  }

  if (uploadStore.hasActiveStreamForSource(source)) {
    console.error(`[screencapture] source ${source} already has an active video capture`);
    return false;
  }

  if (liveStreamStore.hasActiveStreamForSource(source)) {
    console.error(`[screencapture] source ${source} already has an active live stream`);
    return false;
  }

  return true;
}

function normalizeLiveStreamOptions(options: LiveStreamOptions = {}): Required<LiveStreamOptions> | undefined {
  const normalized = {
    maxWidth: options.maxWidth ?? 1280,
    maxHeight: options.maxHeight ?? 720,
    frameRate: options.frameRate ?? 30,
    duration: options.duration ?? 1800,
    maxViewers: options.maxViewers ?? 25,
  };

  const values = Object.values(normalized);
  if (values.some((value) => !Number.isFinite(value) || !Number.isInteger(value) || value < 1)) return;

  return {
    maxWidth: Math.min(normalized.maxWidth, 1280),
    maxHeight: Math.min(normalized.maxHeight, 720),
    frameRate: Math.min(normalized.frameRate, 30),
    duration: Math.min(normalized.duration, 1800),
    maxViewers: Math.min(normalized.maxViewers, 25),
  };
}

function startLiveStream(
  source: number,
  options: LiveStreamOptions = {},
  callback: LiveStreamCallback = () => {},
): string {
  const streamId = nanoid(24);
  const realCallback = typeof callback === 'function' ? callback : () => {};

  const fail = (error: string): string => {
    console.error(`[screencapture] cannot start live stream: ${error}`);
    realCallback({ streamId, source, status: 'error', error });
    return streamId;
  };

  if (!source) {
    return fail('source is required for startLiveStream');
  }

  const normalizedOptions = normalizeLiveStreamOptions(options);
  if (!normalizedOptions) {
    return fail('live stream options must be positive integers');
  }

  if (uploadStore.hasActiveStreamForSource(source) || liveStreamStore.hasActiveStreamForSource(source)) {
    return fail(`source ${source} already has an active video capture`);
  }

  try {
    getLiveStreamClient();
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  try {
    liveStreamStore.addPending(streamId, source, realCallback);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  void provisionLiveStream(streamId, source, normalizedOptions);
  return streamId;
}

global.exports('startLiveStream', startLiveStream);

global.exports(
  'createLiveStreamViewerToken',
  (streamId: string, callback: (result: LiveStreamViewerGrant | { error: string }) => void) => {
    if (!streamId || typeof callback !== 'function') return;

    void (async () => {
      try {
        const entry = liveStreamStore.get(streamId);
        if (entry.state !== 'live' || !entry.ownerToken) {
          throw new Error('Live stream is not ready for viewers');
        }
        callback(await getLiveStreamClient().createViewerToken(streamId, entry.ownerToken));
      } catch (error) {
        callback({ error: error instanceof Error ? error.message : 'Could not create viewer token' });
      }
    })();
  },
);

global.exports('stopLiveStream', (streamId: string, callback?: (stopped: boolean) => void) => {
  if (!streamId) return callback?.(false);
  void endLiveStream(streamId, 'manual').then((stopped) => callback?.(stopped));
});

global.exports('isLiveStreamActive', (streamId: string) => Boolean(streamId && liveStreamStore.has(streamId)));

function startVideoCapture(
  source: number,
  options: CaptureOptions = {},
  callback: CallbackFn = () => {},
  legacyCallback = false,
): string | undefined {
  if (!validateStreamRequest(source, options, legacyCallback ? 'serverCaptureStream' : 'startVideoCapture')) return;

  const captureId = nanoid(24);
  console.log(`[screencapture] Starting video capture for source ${source} with capture ID ${captureId}`);

  const token = uploadStore.addStream({
    captureId,
    source,
    tempDir,
    callback,
    duration: options.duration,
    legacyCallback,
  });

  emitNet('screencapture:captureStream', source, token, options, captureId);

  return captureId;
}

function startVideoCaptureUpload(
  source: number,
  url: string,
  options: StreamRemoteConfig & Pick<CaptureOptions, 'maxWidth' | 'maxHeight' | 'duration'> = {},
  callback: CallbackFn = () => {},
  legacyCallback = false,
): string | undefined {
  if (!url) {
    console.error(`[screencapture] url is required for ${legacyCallback ? 'remoteUploadStream' : 'startVideoCaptureUpload'}`);
    return;
  }

  if (!validateStreamRequest(source, options, legacyCallback ? 'remoteUploadStream' : 'startVideoCaptureUpload')) return;

  const captureId = nanoid(24);
  console.log(`[screencapture] Starting remote video capture for source ${source} with capture ID ${captureId}`);

  const token = uploadStore.addStream({
    captureId,
    source,
    tempDir,
    callback,
    duration: options.duration,
    isRemote: true,
    remoteUrl: url,
    remoteConfig: {
      headers: options?.headers,
      formField: options?.formField,
      filename: options?.filename,
    },
    legacyCallback,
  });

  emitNet('screencapture:captureStream', source, token, options, captureId);

  return captureId;
}

global.exports('startVideoCapture', startVideoCapture);
global.exports('startVideoCaptureUpload', startVideoCaptureUpload);
global.exports('serverCaptureStream', (source: number, options: CaptureOptions, callback: CallbackFn, duration?: number) => {
  return startVideoCapture(source, normalizeStreamOptions(options ?? {}, duration), callback ?? (() => {}), true);
});


global.exports(
  'remoteUploadStream',
  (
    source: number,
    url: string,
    options: StreamRemoteConfig & Pick<CaptureOptions, 'maxWidth' | 'maxHeight'>,
    callback: CallbackFn,
    duration?: number,
  ) => {
    return startVideoCaptureUpload(source, url, normalizeStreamOptions(options ?? {}, duration), callback ?? (() => {}), true);
  },
);

global.exports('stopVideoCapture', (captureId: string) => {
  if (!captureId) return console.error('[screencapture] captureId is required for stopVideoCapture');

  try {
    const streamData = uploadStore.getStreamByCaptureId(captureId);
    emitNet('screencapture:INTERNAL:stopCaptureStream', streamData.source, captureId);
  } catch (err) {
    console.error('[screencapture] stopVideoCapture failed:', err);
  }
});

global.exports('isVideoCaptureActive', (captureId: string) => {
  if (!captureId) return false;

  try {
    uploadStore.getStreamByCaptureId(captureId);
    return true;
  } catch {
    return false;
  }
});

global.exports('INTERNAL_stopServerCaptureStream', (source: number) => {
  const captureId = uploadStore.getCaptureIdBySource(source);
  emitNet('screencapture:INTERNAL:stopCaptureStream', source, captureId);
});

global.exports('stopStream', (source: number) => {  
  const captureId = uploadStore.getCaptureIdBySource(source);
  emitNet('screencapture:INTERNAL:stopCaptureStream', source, captureId); 
});

global.exports(
  'remoteUpload',
  (source: number, url: string, options: CaptureOptions, callback: CallbackFn, dataType: DataType = 'base64') => {
    if (!source) return console.error('source is required for serverCapture');

    const token = uploadStore.addUpload(
      createRegularUploadData({
        callback: callback,
        isRemote: true,
        remoteConfig: {
          ...options,
          encoding: options.encoding ?? 'webp',
        },
        url,
        dataType,
      }),
    );

    emitNet('screencapture:captureScreen', source, token, options, dataType);
  },
);

global.exports(
  'serverCapture',
  (source: number, options: CaptureOptions, callback: CallbackFn, dataType: DataType = 'base64') => {
    if (!source) return console.error('source is required for serverCapture');

    const opts = {
      ...options,
      encoding: options.encoding ?? 'webp',
    };

    const token = uploadStore.addUpload(
      createRegularUploadData({
        callback,
        isRemote: false,
        remoteConfig: opts,
        dataType,
      }),
    );

    emitNet('screencapture:captureScreen', source, token, opts, dataType);
  },
);

// screenshot-basic backwards compatibility
function requestClientScreenshot(source: number, options: CaptureOptions, callback: ScreenshotBasicCallbackFn) {
  if (!source) return console.error('source is required for requestClientScreenshot');

  const opts = {
    ...options,
    encoding: options.encoding ?? 'webp',
  };

  const isBlob = options.fileName ? true : false;

  const token = uploadStore.addUpload(
    createScreenshotBasicUploadData({
      callback,
      isRemote: false,
      remoteConfig: opts,
      dataType: isBlob ? 'blob' : 'base64',
    }),
  );

  emitNet('screencapture:captureScreen', source, token, opts, isBlob ? 'blob' : 'base64');
}

global.exports(
  'requestClientScreenshot',
  (source: number, options: CaptureOptions, callback: ScreenshotBasicCallbackFn) => {
    requestClientScreenshot(source, options, callback);
  },
);
exportHandler(
  'requestClientScreenshot',
  (source: number, options: CaptureOptions, callback: ScreenshotBasicCallbackFn) => {
    requestClientScreenshot(source, options, callback);
  },
);
