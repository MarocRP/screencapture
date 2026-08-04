import { createServer } from './koa-router';
import './export';
import { UploadStore } from './upload-store';
import { initializeSentry } from './sentry';
import { checkForUpdates } from './version-checker';

export const uploadStore = new UploadStore();

import { registerImageHandlers } from './image';
import { registerStreamHandlers } from './stream';

async function boot() {
  initializeSentry();
  void checkForUpdates();
  createServer(uploadStore);
  registerImageHandlers();
  registerStreamHandlers();
}

boot();
