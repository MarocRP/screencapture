import * as Sentry from '@sentry/browser';
import {
  NUI_SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_ERROR_SAMPLE_RATE,
  SENTRY_RELEASE,
  SENTRY_TRACES_SAMPLE_RATE,
} from '../../sentry-config';

function getResourceName(): string {
  return window.GetParentResourceName?.() ?? 'screencapture';
}

function normalizeSampleRate(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

export function initializeSentry(): void {
  if (!SENTRY_ENABLED || !NUI_SENTRY_DSN) return;

  Sentry.init({
    dsn: NUI_SENTRY_DSN,
    release: SENTRY_RELEASE || getResourceName(),
    environment: SENTRY_ENVIRONMENT || undefined,
    sendDefaultPii: false,
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

  Sentry.setTag('runtime', 'nui');
  Sentry.setTag('resource', getResourceName());
  console.log('[screencapture] NUI Sentry enabled');
}
