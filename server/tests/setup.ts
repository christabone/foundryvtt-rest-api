// Global test setup
import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';

// Increase timeout for integration tests
jest.setTimeout(10000);

// Mock console methods in tests to reduce noise
const originalConsole = console;

beforeAll(() => {
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as any;
});

afterAll(() => {
  global.console = originalConsole;
});

// Clean up any running servers after each test
afterEach(async () => {
  // Force close any hanging connections
  await new Promise(resolve => setTimeout(resolve, 100));
});