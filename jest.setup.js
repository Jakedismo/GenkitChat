// jest.setup.js
import { TextDecoder, TextEncoder } from 'util';
import 'web-streams-polyfill/dist/polyfill.js';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

