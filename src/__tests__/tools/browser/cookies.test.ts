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
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    loadCookiesTool = new LoadCookiesTool(mockServer);
    // Reset all mocks
    mockIsConnected.mockReturnValue(true);
    mockIsClosed.mockReturnValue(false);
    mockRedisConnect.mockImplementation(() => Promise.resolve());
    mockRedisDisconnect.mockImplementation(() => Promise.resolve());
    
    // Set up environment variable for tests
    process.env = { ...originalEnv };
    process.env.REDIS_PATH = 'xpto.cookies';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should load cookies from Redis successfully', async () => {
    const testJsonData = {
      xpto: {
        cookies: [
          {
            name: "JSESSIONID",
            value: "\"fdsasdasdjlE1\"",
            domain: "www.xxx.com.br",
            path: "/xxx",
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: "None"
          },
          {
            name: "Xpto",
            value: "123",
            domain: "www.xxx.com.br",
            path: "/xxx",
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: "None"
          }
        ]
      }
    };
    mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(testJsonData)));

    const args = { redis_key: 'test_cookies' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(mockRedisConnect).toHaveBeenCalled();
    expect(mockRedisGet).toHaveBeenCalledWith('test_cookies');
    expect(mockAddCookies).toHaveBeenCalledWith([
      {
        name: "JSESSIONID",
        value: "\"fdsasdasdjlE1\"",
        domain: "www.xxx.com.br",
        path: "/xxx",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "None"
      },
      {
        name: "Xpto",
        value: "123",
        domain: "www.xxx.com.br",
        path: "/xxx",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "None"
      }
    ]);
    expect(mockRedisDisconnect).toHaveBeenCalled();
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Successfully loaded 2 cookies');
  });

  test('should handle missing redis_key parameter', async () => {
    const args = { redis_key: '' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('redis_key parameter is required');
  });

  test('should handle missing REDIS_PATH environment variable', async () => {
    delete process.env.REDIS_PATH;
    
    const args = { redis_key: 'test_cookies' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('REDIS_PATH environment variable is required');
  });

  test('should handle non-existent Redis key', async () => {
    mockRedisGet.mockImplementation(() => Promise.resolve(null));

    const args = { redis_key: 'nonexistent_key' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No data found for key: nonexistent_key');
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

  test('should handle invalid JSON format', async () => {
    mockRedisGet.mockImplementation(() => Promise.resolve('invalid_json_format'));

    const args = { redis_key: 'test_cookies' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid JSON format for key: test_cookies');
    expect(mockRedisDisconnect).toHaveBeenCalled();
  });

  test('should handle invalid cookie path', async () => {
    const testJsonData = {
      different: {
        path: []
      }
    };
    mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(testJsonData)));

    const args = { redis_key: 'test_cookies' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No cookies found at path: xpto.cookies');
    expect(mockRedisDisconnect).toHaveBeenCalled();
  });

  test('should handle cookies with complex values', async () => {
    const testJsonData = {
      xpto: {
        cookies: [
          {
            name: "token",
            value: "jwt=eyJ123",
            domain: "example.com",
            path: "/",
            expires: 1234567890,
            httpOnly: true,
            secure: true,
            sameSite: "Strict"
          }
        ]
      }
    };
    mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(testJsonData)));

    const args = { redis_key: 'test_cookies' };
    const result = await loadCookiesTool.execute(args, mockToolContext);

    expect(mockAddCookies).toHaveBeenCalledWith([
      {
        name: "token",
        value: "jwt=eyJ123",
        domain: "example.com",
        path: "/",
        expires: 1234567890,
        httpOnly: true,
        secure: true,
        sameSite: "Strict"
      }
    ]);
    expect(result.isError).toBe(false);
  });
});