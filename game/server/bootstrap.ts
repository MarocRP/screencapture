import { createServer } from './koa-router';
import './export';
import { UploadStore } from './upload-store';
import { initializeSentry } from './sentry';

export const uploadStore = new UploadStore();

import { registerImageHandlers } from './image';
import { registerStreamHandlers } from './stream';

async function boot() {
  initializeSentry();
  createServer(uploadStore);
  registerImageHandlers();
  registerStreamHandlers();
}

boot();
