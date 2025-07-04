import fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Page, Download } from 'playwright';
import { BrowserToolBase } from './base.js';
import { ToolContext, ToolResponse, createSuccessResponse, createErrorResponse } from '../common/types.js';

const defaultDownloadsPath = path.join(os.homedir(), 'Downloads');

/**
 * Information about a completed download
 */
interface DownloadInfo {
  name: string;
  originalFilename: string;
  savePath: string;
  timestamp: string;
  size?: number;
  url?: string;
}

/**
 * Tool for handling file downloads with event-based triggers
 */
export class DownloadTool extends BrowserToolBase {
  private downloads = new Map<string, DownloadInfo>();

  /**
   * Execute the download tool
   */
  async execute(args: any, context: ToolContext): Promise<ToolResponse> {
    return this.safeExecute(context, async (page) => {
      // Validate required parameters
      if (!args.name) {
        return createErrorResponse("Missing required parameter: name");
      }

      if (!args.trigger) {
        return createErrorResponse("Missing required parameter: trigger");
      }

      const timeout = args.timeout || 30000; // Default 30 seconds
      const downloadsDir = args.downloadsDir || defaultDownloadsPath;
      const downloadName = args.name;

      // Ensure downloads directory exists
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }

      try {
        // Start waiting for download before triggering the event
        const downloadPromise = page.waitForEvent('download', { timeout });

        // Execute the trigger action
        await this.executeTrigger(page, args.trigger);

        // Wait for the download to start
        const download = await downloadPromise;

        // Get suggested filename from the download
        const suggestedFilename = download.suggestedFilename() || 'downloaded-file';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${downloadName}-${timestamp}-${suggestedFilename}`;
        const savePath = path.join(downloadsDir, filename);

        // Save the download
        await download.saveAs(savePath);

        // Store download information
        const downloadInfo: DownloadInfo = {
          name: downloadName,
          originalFilename: suggestedFilename,
          savePath,
          timestamp: new Date().toISOString(),
          url: download.url()
        };

        // Get file size if possible
        try {
          const stats = fs.statSync(savePath);
          downloadInfo.size = stats.size;
        } catch (error) {
          // Size information is optional
        }

        this.downloads.set(downloadName, downloadInfo);

        // Notify server of resource changes
        this.server.notification({
          method: "notifications/resources/list_changed",
        });

        const messages = [
          `Download completed successfully`,
          `File saved to: ${path.relative(process.cwd(), savePath)}`,
          `Original filename: ${suggestedFilename}`,
          `Download stored in memory with name: '${downloadName}'`
        ];

        if (downloadInfo.size) {
          messages.push(`File size: ${this.formatBytes(downloadInfo.size)}`);
        }

        return createSuccessResponse(messages);

      } catch (error) {
        const errorMessage = (error as Error).message;
        
        if (errorMessage.includes('Timeout')) {
          return createErrorResponse(`Download timeout after ${timeout}ms. No download was triggered or completed within the specified time.`);
        }
        
        return createErrorResponse(`Download failed: ${errorMessage}`);
      }
    });
  }

  /**
   * Execute the trigger action that should initiate the download
   */
  private async executeTrigger(page: Page, trigger: any): Promise<void> {
    if (typeof trigger === 'string') {
      // Assume it's a CSS selector to click
      await page.click(trigger);
    } else if (typeof trigger === 'object') {
      if (trigger.type === 'click' && trigger.selector) {
        await page.click(trigger.selector);
      } else if (trigger.type === 'evaluate' && trigger.script) {
        await page.evaluate(trigger.script);
      } else if (trigger.type === 'keyboard' && trigger.keys) {
        await page.keyboard.press(trigger.keys);
      } else {
        throw new Error(`Unsupported trigger type: ${JSON.stringify(trigger)}`);
      }
    } else {
      throw new Error(`Invalid trigger parameter: ${JSON.stringify(trigger)}`);
    }
  }

  /**
   * Format bytes into human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get all stored downloads
   */
  getDownloads(): Map<string, DownloadInfo> {
    return this.downloads;
  }

  /**
   * Get a specific download by name
   */
  getDownload(name: string): DownloadInfo | undefined {
    return this.downloads.get(name);
  }

  /**
   * Clear all stored downloads
   */
  clearDownloads(): void {
    this.downloads.clear();
  }
}