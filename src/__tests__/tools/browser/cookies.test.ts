import { LoadCookiesTool } from '../../../tools/browser/cookies.js';
import { ToolContext } from '../../../tools/common/types.js';
import { Page, Browser, BrowserContext } from 'playwright';
import { jest } from '@jest/globals';

// Mock Redis
const mockRedisGet = jest.fn();
const mockRedisConnect = jest.fn();
const mockRedisDisconnect = jest.fn();

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    get: mockRedisGet,
    connect: mockRedisConnect,
    disconnect: mockRedisDisconnect
  }))
}));

// Mock the Page and Context objects
const mockAddCookies = jest.fn();
mockAddCookies.mockImplementation(() => Promise.resolve());

const mockContext = {
  addCookies: mockAddCookies
} as unknown as BrowserContext;

const mockPageContext = jest.fn().mockReturnValue(mockContext);
const mockIsClosed = jest.fn().mockReturnValue(false);

const mockPage = {
  context: mockPageContext,
  isClosed: mockIsClosed
} as unknown as Page;

// Mock the browser
const mockIsConnected = jest.fn().mockReturnValue(true);
const mockBrowser = {
  isConnected: mockIsConnected
} as unknown as Browser;

// Mock the server
const mockServer = {
  sendMessage: jest.fn()
};

// Mock context
const mockToolContext = {
  page: mockPage,
  browser: mockBrowser,
  server: mockServer
} as ToolContext;

describe('LoadCookiesTool', () => {
  let loadCookiesTool: LoadCookiesTool;

  beforeEach(() => {
    jest.clearAllMocks();
    loadCookiesTool = new LoadCookiesTool(mockServer);
    // Reset all mocks
    mockIsConnected.mockReturnValue(true);
    mockIsClosed.mockReturnValue(false);
    mockRedisConnect.mockImplementation(() => Promise.resolve());
    mockRedisDisconnect.mockImplementation(() => Promise.resolve());
  });

  test('should load cookies from Redis successfully', async () => {
    const testCookiesString = 'session=abc123; user=johndoe; theme=dark';
    mockRedisGet.mockImplementation(() => Promise.resolve(testCookiesString));

    const args = { redis_key: 'test_cookies' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(mockRedisConnect).toHaveBeenCalled();
    expect(mockRedisGet).toHaveBeenCalledWith('test_cookies');
    expect(mockAddCookies).toHaveBeenCalledWith([
      { name: 'session', value: 'abc123', domain: '.localhost', path: '/' },
      { name: 'user', value: 'johndoe', domain: '.localhost', path: '/' },
      { name: 'theme', value: 'dark', domain: '.localhost', path: '/' }
    ]);
    expect(mockRedisDisconnect).toHaveBeenCalled();
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Successfully loaded 3 cookies');
  });

  test('should handle missing redis_key parameter', async () => {
    const args = { redis_key: '' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('redis_key parameter is required');
  });

  test('should handle non-existent Redis key', async () => {
    mockRedisGet.mockImplementation(() => Promise.resolve(null));

    const args = { redis_key: 'nonexistent_key' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No cookies found for key: nonexistent_key');
    expect(mockRedisDisconnect).toHaveBeenCalled();
  });

  test('should handle Redis connection error', async () => {
    mockRedisConnect.mockImplementation(() => Promise.reject(new Error('Connection failed')));

    const args = { redis_key: 'test_cookies' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to load cookies from Redis: Connection failed');
    expect(mockRedisDisconnect).toHaveBeenCalled();
  });

  test('should handle invalid cookie format', async () => {
    mockRedisGet.mockImplementation(() => Promise.resolve('invalid_cookie_format'));

    const args = { redis_key: 'test_cookies' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid cookie format for key: test_cookies');
    expect(mockRedisDisconnect).toHaveBeenCalled();
  });

  test('should handle cookies with equals signs in values', async () => {
    const testCookiesString = 'token=jwt=eyJ123; data=name=john,age=30';
    mockRedisGet.mockImplementation(() => Promise.resolve(testCookiesString));

    const args = { redis_key: 'test_cookies' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(mockAddCookies).toHaveBeenCalledWith([
      { name: 'token', value: 'jwt=eyJ123', domain: '.localhost', path: '/' },
      { name: 'data', value: 'name=john,age=30', domain: '.localhost', path: '/' }
    ]);
    expect(result.isError).toBe(false);
  });
});