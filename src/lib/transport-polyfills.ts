// The shared transport uses the same browser polyfills as gnosis-frontend.
import 'reflect-metadata';
import process from 'process';
import { Buffer } from 'buffer';
const runtime = globalThis as typeof globalThis & { process?: typeof process; Buffer?: typeof Buffer };
runtime.process ??= process;
runtime.Buffer ??= Buffer;
