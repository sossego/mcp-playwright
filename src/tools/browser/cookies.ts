import { createClient } from 'redis';
import type { Page } from 'playwright';
import { BrowserToolBase } from './base.js';
import { ToolContext, ToolResponse, createErrorResponse, createSuccessResponse } from '../common/types.js';

/**
 * Tool for loading cookies from Redis and setting them in the browser context
 */
export class LoadCookiesTool extends BrowserToolBase {
  async execute(args: { redis_key: string }, context: ToolContext): Promise<ToolResponse> {
    return await this.safeExecute(context, async (page: Page) => {
      const { redis_key } = args;

      if (!redis_key) {
        return createErrorResponse("redis_key parameter is required");
      }

      const redisPath = process.env.REDIS_PATH;
      if (!redisPath) {
        return createErrorResponse("REDIS_PATH environment variable is required");
      }

      // Create Redis client using environment variables
      const redisClient = createClient({
        url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
        password: process.env.REDIS_PASSWORD,
        database: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB) : 0
      });

      try {
        // Connect to Redis
        await redisClient.connect();

        // Get JSON data from Redis
        const jsonString = await redisClient.get(redis_key);
        
        if (!jsonString) {
          return createErrorResponse(`No data found for key: ${redis_key}`);
        }

        // Parse JSON data
        let jsonData;
        try {
          jsonData = JSON.parse(jsonString);
        } catch (parseError) {
          return createErrorResponse(`Invalid JSON format for key: ${redis_key}`);
        }

        // Navigate to the cookies path using REDIS_PATH
        const cookies = this.extractCookiesFromPath(jsonData, redisPath);
        
        if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
          return createErrorResponse(`No cookies found at path: ${redisPath} for key: ${redis_key}`);
        }

        // Set cookies in the browser context
        await page.context().addCookies(cookies);

        return createSuccessResponse(`Successfully loaded ${cookies.length} cookies from Redis key: ${redis_key}, path: ${redisPath}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return createErrorResponse(`Failed to load cookies from Redis: ${errorMessage}`);
      } finally {
        // Always disconnect from Redis
        try {
          await redisClient.disconnect();
        } catch (disconnectError) {
          // Log but don't fail on disconnect error
          console.warn('Warning: Failed to disconnect from Redis:', disconnectError);
        }
      }
    });
  }

  /**
   * Extract cookies from JSON data using the specified path
   * Example: path "xpto.cookies" will extract data.xpto.cookies from the JSON
   */
  private extractCookiesFromPath(jsonData: any, path: string): Array<{name: string, value: string, domain?: string, path?: string, expires?: number, httpOnly?: boolean, secure?: boolean, sameSite?: 'Strict' | 'Lax' | 'None'}> {
    const pathParts = path.split('.');
    let current = jsonData;
    
    // Navigate through the JSON path
    for (const part of pathParts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return [];
      }
    }
    
    // Ensure we have an array of cookies
    if (!Array.isArray(current)) {
      return [];
    }
    
    // Validate and return cookies
    return current.filter(cookie => 
      cookie && 
      typeof cookie === 'object' && 
      'name' in cookie && 
      'value' in cookie
    ).map(cookie => {
      // Validate sameSite value and set to undefined if invalid
      if (cookie.sameSite && !['Strict', 'Lax', 'None'].includes(cookie.sameSite)) {
        const { sameSite, ...cookieWithoutSameSite } = cookie;
        return cookieWithoutSameSite;
      }
      return cookie;
    });
  }
}