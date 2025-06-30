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

      // Create Redis client using environment variables
      const redisClient = createClient({
        url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
        password: process.env.REDIS_PASSWORD,
        database: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB) : 0
      });

      try {
        // Connect to Redis
        await redisClient.connect();

        // Get cookies string from Redis
        const cookiesString = await redisClient.get(redis_key);
        
        if (!cookiesString) {
          return createErrorResponse(`No cookies found for key: ${redis_key}`);
        }

        // Parse cookies from HTTP header format
        const cookies = this.parseCookieString(cookiesString);
        
        if (cookies.length === 0) {
          return createErrorResponse(`Invalid cookie format for key: ${redis_key}`);
        }

        // Set cookies in the browser context
        await page.context().addCookies(cookies);

        return createSuccessResponse(`Successfully loaded ${cookies.length} cookies from Redis key: ${redis_key}`);

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
   * Parse cookies from HTTP header string format
   * Example: "name1=value1; name2=value2; name3=value3"
   */
  private parseCookieString(cookiesString: string): Array<{name: string, value: string, domain?: string, path?: string}> {
    const cookies: Array<{name: string, value: string, domain?: string, path?: string}> = [];
    
    // Split by semicolon and parse each cookie
    const cookieParts = cookiesString.split(';');
    
    for (const part of cookieParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      
      const [name, ...valueParts] = trimmed.split('=');
      if (!name || valueParts.length === 0) continue;
      
      const value = valueParts.join('='); // Handle values that contain '='
      
      cookies.push({
        name: name.trim(),
        value: value.trim(),
        domain: '.localhost', // Default domain, can be configured
        path: '/'             // Default path
      });
    }
    
    return cookies;
  }
}