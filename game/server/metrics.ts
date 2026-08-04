import fetch from 'node-fetch';
import { METRICS_ENABLED, METRICS_ENDPOINT, METRICS_WRITE_KEY } from '../telemetry-config';
import { SENTRY_RELEASE } from '../sentry-config';

type UploadMetricEvent = {
  event: 'upload_started' | 'upload_finished' | 'upload_failed';
  kind: 'image' | 'video';
  status: 'started' | 'success' | 'failed';
  uploadUrl: string;
  httpStatus?: number;
  bytes?: number;
  durationMs?: number;
  dataType?: string;
  captureId?: string;
  source?: number;
};

type UploadHttpError = Error & {
  httpStatus?: number;
};

function getResourceName(): string {
  try {
    return GetCurrentResourceName();
  } catch {
    return 'screencapture';
  }
}

function getResourceVersion(): string {
  try {
    return GetResourceMetadata(getResourceName(), 'version', 0) || 'unknown';
  } catch {
    return 'unknown';
  }
}

function getUploadTarget(uploadUrl: string): { host?: string; path?: string } {
  try {
    const parsed = new URL(uploadUrl);
    return {
      host: parsed.hostname,
      path: parsed.pathname,
    };
  } catch {
    return {};
  }
}

function getHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const status = (err as UploadHttpError).httpStatus;
  return typeof status === 'number' ? status : undefined;
}

export function captureUploadMetric(metric: UploadMetricEvent): void {
  if (!METRICS_ENABLED || !METRICS_ENDPOINT) return;

  const target = getUploadTarget(metric.uploadUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (METRICS_WRITE_KEY) {
    headers['x-screencapture-key'] = METRICS_WRITE_KEY;
  }

  fetch(METRICS_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event: metric.event,
      kind: metric.kind,
      status: metric.status,
      runtime: 'server',
      uploadHost: target.host,
      uploadPath: target.path,
      httpStatus: metric.httpStatus,
      bytes: metric.bytes,
      durationMs: metric.durationMs,
      dataType: metric.dataType,
      version: getResourceVersion(),
      release: SENTRY_RELEASE,
      captureId: metric.captureId,
      source: metric.source,
    }),
  }).catch((err) => {
    console.warn('[screencapture] metrics upload failed:', err instanceof Error ? err.message : err);
  });
}

export function getUploadMetricHttpStatus(err: unknown): number | undefined {
  return getHttpStatus(err);
}