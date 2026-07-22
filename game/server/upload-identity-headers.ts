const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]));
  }

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  return headers as Record<string, string>;
}

function isUploadIdentityHeadersEnabled(): boolean {
  const value = GetConvar('screencapture_upload_identity_headers', 'true').trim().toLowerCase();
  return !DISABLED_VALUES.has(value);
}

function getUploadHost(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function getServerName(): string | undefined {
  const projectName = GetConvar('sv_projectName', '').trim();
  if (projectName) return projectName;

  const hostname = GetConvar('sv_hostname', '').trim();
  return hostname || undefined;
}

export function createUploadHeaders(url: string, headers?: HeadersInit): Record<string, string> {
  const customHeaders = normalizeHeaders(headers);
  if (!isUploadIdentityHeadersEnabled()) return customHeaders;

  const resourceName = GetCurrentResourceName();
  const resourceVersion = GetResourceMetadata(resourceName, 'version', 0) || 'unknown';
  const serverName = getServerName();
  const uploadHost = getUploadHost(url);

  return {
    'User-Agent': `screencapture/${resourceVersion}`,
    ...(serverName && { 'X-Screencapture-Server-Name': serverName }),
    ...(uploadHost && { 'X-Screencapture-Upload-Host': uploadHost }),
    'X-Screencapture-Resource': resourceName,
    ...customHeaders,
  };
}
