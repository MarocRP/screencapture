import { Capture } from './capture';
import { CaptureStream } from './capture-stream';
import { initializeSentry } from './sentry-report';
import './style.css';

initializeSentry();

const capture = new Capture();
capture.start();

const stream = new CaptureStream();
stream.start();
