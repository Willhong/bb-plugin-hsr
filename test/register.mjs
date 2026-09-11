// SDK 0.4.55's ESM host bundle contains CommonJS cross-spawn requires.
// Match the host loader's require bridge when importing it in Node tests.
import { createRequire } from 'node:module';
globalThis.require = createRequire(import.meta.url);
