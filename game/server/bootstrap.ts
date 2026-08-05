import { createServer } from './koa-router';
import './export';
import { UploadStore } from './upload-store';
import { LiveStreamStore } from './live-store';
import { initializeSentry } from './sentry';
import { checkForUpdates } from './version-checker';

export const uploadStore = new UploadStore();
export const liveStreamStore = new LiveStreamStore();

import { registerImageHandlers } from './image';
import { registerStreamHandlers } from './stream';
import { registerLiveStreamHandlers } from './live';

async function boot() {
  initializeSentry();
  void checkForUpdates();
  createServer(uploadStore);
  registerImageHandlers();
  registerStreamHandlers();
  registerLiveStreamHandlers();
}

boot();
