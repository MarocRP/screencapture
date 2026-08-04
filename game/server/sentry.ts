import * as Sentry from '@sentry/node';
import {
  SENTRY_ENABLED,
  SERVER_SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  SENTRY_ERROR_SAMPLE_RATE,
  SENTRY_RELEASE,
  SENTRY_TRACES_SAMPLE_RATE,
} from '../sentry-config';

type SentryTagValue = string | number | boolean | undefined;

type CaptureContext = {
  tags?: Record<string, SentryTagValue>;
  extra?: Record<string, unknown>;
  fingerprint?: string[];
};

type UploadErrorContext = {
  kind: 'image' | 'video';
  uploadUrl?: string;
  dataType?: string;
  captureId?: string;
  correlationId?: string;
  source?: number;
  bytes?: number;
  stage?: string;
};

type UploadHttpError = Error & {
  httpStatus?: number;
};

let initAttempted = false;
let initialized = false;

function readConvar(name: string, fallback = ''): string {
  try {
    return GetConvar(name, fallback).trim();
  } catch {
    return fallback;
  }
}

function normalizeSampleRate(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function getResourceName(): string {
  try {
    return GetCurrentResourceName();
  } catch {
    return 'screencapture';
  }
}

function getResourceVersion(resourceName: string): string {
  try {
    return GetResourceMetadata(resourceName, 'version', 0) || 'unknown';
  } catch {
    return 'unknown';
  }
}

function getEnvironment(): string | undefined {
  if (SENTRY_ENVIRONMENT) return SENTRY_ENVIRONMENT;

  const projectName = readConvar('sv_projectName', '');
  return projectName || undefined;
}

function truncateTag(value: SentryTagValue): string | undefined {
  if (value === undefined) return undefined;
  return String(value).slice(0, 200);
}

function getUploadTarget(uploadUrl?: string): { protocol?: string; host?: string; path?: string } {
  if (!uploadUrl) return {};

  try {
    const parsed = new URL(uploadUrl);
    return {
      protocol: parsed.protocol.replace(':', ''),
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

function toSentryError(err: unknown, context?: UploadErrorContext): Error {
  const httpStatus = getHttpStatus(err);

  if (context?.kind && httpStatus) {
    const error = new Error(`${context.kind} upload failed with HTTP ${httpStatus}`);
    if (err instanceof Error && err.stack) error.stack = err.stack;
    return error;
  }

  if (err instanceof Error) return err;
  return new Error(String(err));
}

export function initializeSentry(): boolean {
  if (initAttempted) return initialized;
  initAttempted = true;

  if (!SENTRY_ENABLED || !SERVER_SENTRY_DSN) {
    return false;
  }

  const resourceName = getResourceName();
  const resourceVersion = getResourceVersion(resourceName);

  Sentry.init({
    dsn: SERVER_SENTRY_DSN,
    release: SENTRY_RELEASE || `${resourceName}@${resourceVersion}`,
    environment: getEnvironment(),
    sendDefaultPii: false,
    attachStacktrace: true,
    sampleRate: normalizeSampleRate(SENTRY_ERROR_SAMPLE_RATE, 1),
    tracesSampleRate: normalizeSampleRate(SENTRY_TRACES_SAMPLE_RATE, 0),
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.query_string;
      }

      return event;
    },
  });

  Sentry.setTag('resource', resourceName);
  Sentry.setTag('resource_version', resourceVersion);

  initialized = true;
  console.log('[screencapture] Sentry enabled');
  return true;
}

export function captureException(err: unknown, context: CaptureContext = {}): void {
  if (!initialized) return;

  Sentry.withScope((scope) => {
    scope.setLevel('error');

    for (const [key, value] of Object.entries(context.tags ?? {})) {
      const tag = truncateTag(value);
      if (tag !== undefined) scope.setTag(key, tag);
    }

    if (context.extra) {
      scope.setContext('screencapture', context.extra);
    }

    if (context.fingerprint) {
      scope.setFingerprint(context.fingerprint);
    }

    Sentry.captureException(err);
  });
}

export function captureUploadException(err: unknown, context: UploadErrorContext): void {
  const target = getUploadTarget(context.uploadUrl);
  const httpStatus = getHttpStatus(err);

  captureException(toSentryError(err, context), {
    tags: {
      event: 'upload_failed',
      upload_kind: context.kind,
      upload_host: target.host,
      upload_protocol: target.protocol,
      http_status: httpStatus,
      data_type: context.dataType,
      stage: context.stage,
    },
    extra: {
      uploadPath: target.path,
      bytes: context.bytes,
      source: context.source,
      captureId: context.captureId,
      correlationId: context.correlationId,
    },
    fingerprint: [
      'screencapture-upload',
      context.kind,
      target.host ?? 'unknown-host',
      String(httpStatus ?? 'network'),
    ],
  });
}


