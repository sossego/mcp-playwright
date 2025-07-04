import { DownloadTool } from '../../../tools/browser/download.js';
import { ToolContext } from '../../../tools/common/types.js';
import { Page, Browser, Download } from 'playwright';
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// Mock fs module
jest.mock('node:fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ size: 1024 })
}));

// Mock the Download object
const mockSaveAs = jest.fn().mockImplementation(() => Promise.resolve());
const mockSuggestedFilename = jest.fn().mockReturnValue('test-file.pdf');
const mockUrl = jest.fn().mockReturnValue('https://example.com/file.pdf');

const mockDownload = {
  saveAs: mockSaveAs,
  suggestedFilename: mockSuggestedFilename,
  url: mockUrl
} as unknown as Download;

// Mock the Page object
const mockClick = jest.fn().mockImplementation(() => Promise.resolve());
const mockEvaluate = jest.fn().mockImplementation(() => Promise.resolve());
const mockWaitForEvent = jest.fn().mockImplementation(() => Promise.resolve(mockDownload));
const mockKeyboard = {
  press: jest.fn().mockImplementation(() => Promise.resolve())
};

const mockIsClosed = jest.fn().mockReturnValue(false);
const mockPage = {
  click: mockClick,
  evaluate: mockEvaluate,
  waitForEvent: mockWaitForEvent,
  keyboard: mockKeyboard,
  isClosed: mockIsClosed
} as unknown as Page;

// Mock browser
const mockIsConnected = jest.fn().mockReturnValue(true);
const mockBrowser = {
  isConnected: mockIsConnected
} as unknown as Browser;

// Mock the server
const mockServer = {
  sendMessage: jest.fn(),
  notification: jest.fn()
};

// Mock context
const mockContext = {
  page: mockPage,
  browser: mockBrowser,
  server: mockServer
} as ToolContext;

describe('DownloadTool', () => {
  let downloadTool: DownloadTool;

  beforeEach(() => {
    jest.clearAllMocks();
    downloadTool = new DownloadTool(mockServer);
    
    // Mock Date to return a consistent value for testing
    jest.spyOn(global.Date.prototype, 'toISOString').mockReturnValue('2023-01-01T12:00:00.000Z');
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should handle download with CSS selector trigger', async () => {
    const args = {
      name: 'test-download',
      trigger: '#download-button'
    };

    const result = await downloadTool.execute(args, mockContext);

    // Check if waitForEvent was called for download
    expect(mockWaitForEvent).toHaveBeenCalledWith('download', { timeout: 30000 });
    
    // Check if click was called with the selector
    expect(mockClick).toHaveBeenCalledWith('#download-button');
    
    // Check if download was saved
    expect(mockSaveAs).toHaveBeenCalled();
    
    // Check that the result contains success message
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Download completed successfully');
  });

  test('should handle download with object trigger (click)', async () => {
    const args = {
      name: 'test-download',
      trigger: {
        type: 'click',
        selector: '.download-link'
      }
    };

    const result = await downloadTool.execute(args, mockContext);

    expect(mockWaitForEvent).toHaveBeenCalledWith('download', { timeout: 30000 });
    expect(mockClick).toHaveBeenCalledWith('.download-link');
    expect(result.isError).toBe(false);
  });

  test('should handle download with object trigger (evaluate)', async () => {
    const args = {
      name: 'test-download',
      trigger: {
        type: 'evaluate',
        script: 'document.getElementById("download").click()'
      }
    };

    const result = await downloadTool.execute(args, mockContext);

    expect(mockWaitForEvent).toHaveBeenCalledWith('download', { timeout: 30000 });
    expect(mockEvaluate).toHaveBeenCalledWith('document.getElementById("download").click()');
    expect(result.isError).toBe(false);
  });

  test('should handle download with object trigger (keyboard)', async () => {
    const args = {
      name: 'test-download',
      trigger: {
        type: 'keyboard',
        keys: 'Control+S'
      }
    };

    const result = await downloadTool.execute(args, mockContext);

    expect(mockWaitForEvent).toHaveBeenCalledWith('download', { timeout: 30000 });
    expect(mockKeyboard.press).toHaveBeenCalledWith('Control+S');
    expect(result.isError).toBe(false);
  });

  test('should use custom timeout when provided', async () => {
    const args = {
      name: 'test-download',
      trigger: '#download-button',
      timeout: 60000
    };

    await downloadTool.execute(args, mockContext);

    expect(mockWaitForEvent).toHaveBeenCalledWith('download', { timeout: 60000 });
  });

  test('should handle custom downloads directory', async () => {
    const args = {
      name: 'test-download',
      trigger: '#download-button',
      downloadsDir: '/custom/downloads/path'
    };

    (fs.existsSync as jest.Mock).mockReturnValue(false);

    await downloadTool.execute(args, mockContext);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/custom/downloads/path', { recursive: true });
  });

  test('should handle missing name parameter', async () => {
    const args = {
      trigger: '#download-button'
    };

    const result = await downloadTool.execute(args, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required parameter: name');
  });

  test('should handle missing trigger parameter', async () => {
    const args = {
      name: 'test-download'
    };

    const result = await downloadTool.execute(args, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required parameter: trigger');
  });

  test('should handle download timeout', async () => {
    const args = {
      name: 'test-download',
      trigger: '#download-button',
      timeout: 5000
    };

    mockWaitForEvent.mockImplementationOnce(() => 
      Promise.reject(new Error('Timeout waiting for download'))
    );

    const result = await downloadTool.execute(args, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Download timeout after 5000ms');
  });

  test('should handle unsupported trigger type', async () => {
    const args = {
      name: 'test-download',
      trigger: {
        type: 'unsupported',
        action: 'something'
      }
    };

    const result = await downloadTool.execute(args, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unsupported trigger type');
  });

  test('should handle invalid trigger parameter', async () => {
    const args = {
      name: 'test-download',
      trigger: 123
    };

    const result = await downloadTool.execute(args, mockContext);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid trigger parameter');
  });

  test('should store downloads in a map', async () => {
    const args = {
      name: 'test-download',
      trigger: '#download-button'
    };

    await downloadTool.execute(args, mockContext);
    
    // Check that the download was stored in the map
    const downloads = downloadTool.getDownloads();
    expect(downloads.has('test-download')).toBe(true);
    
    const downloadInfo = downloads.get('test-download');
    expect(downloadInfo?.name).toBe('test-download');
    expect(downloadInfo?.originalFilename).toBe('test-file.pdf');
    expect(downloadInfo?.url).toBe('https://example.com/file.pdf');
  });

  test('should handle missing page', async () => {
    const args = {
      name: 'test-download',
      trigger: '#download-button'
    };

    // Context without page but with browser
    const contextWithoutPage = {
      browser: mockBrowser,
      server: mockServer
    } as unknown as ToolContext;

    const result = await downloadTool.execute(args, contextWithoutPage);

    expect(mockWaitForEvent).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Browser page not initialized');
  });

  test('should notify server of resource changes', async () => {
    const args = {
      name: 'test-download',
      trigger: '#download-button'
    };

    await downloadTool.execute(args, mockContext);

    expect(mockServer.notification).toHaveBeenCalledWith({
      method: "notifications/resources/list_changed",
    });
  });

  test('should get specific download by name', async () => {
    const args = {
      name: 'specific-download',
      trigger: '#download-button'
    };

    await downloadTool.execute(args, mockContext);
    
    const downloadInfo = downloadTool.getDownload('specific-download');
    expect(downloadInfo).toBeTruthy();
    expect(downloadInfo?.name).toBe('specific-download');
  });

  test('should clear all downloads', async () => {
    const args = {
      name: 'test-download',
      trigger: '#download-button'
    };

    await downloadTool.execute(args, mockContext);
    
    expect(downloadTool.getDownloads().size).toBe(1);
    
    downloadTool.clearDownloads();
    
    expect(downloadTool.getDownloads().size).toBe(0);
  });

  test('should handle file stat error gracefully', async () => {
    const args = {
      name: 'test-download',
      trigger: '#download-button'
    };

    (fs.statSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('File not found');
    });

    const result = await downloadTool.execute(args, mockContext);

    // Should still succeed even if stat fails
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Download completed successfully');
  });

  test('should include file size in output when available', async () => {
    const args = {
      name: 'test-download',
      trigger: '#download-button'
    };

    const result = await downloadTool.execute(args, mockContext);

    expect(result.isError).toBe(false);
    
    // Check that file size is included in one of the content items
    const allText = result.content.map(c => c.text).join(' ');
    expect(allText).toContain('File size: 1 KB');
  });
});