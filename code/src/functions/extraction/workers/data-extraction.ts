import { ExtractorEventType, processTask } from '@devrev/ts-adaas';

import { normalizeAttachment, normalizeTodo, normalizeUser } from '../../external-system/data-normalization';
import { HttpClient } from '../../external-system/http-client';
import { ExtractorState } from '../index';

// TODO: Replace with actual repos that will be used to store the
// data extracted from the external system. For example, you might want to
// create repos for todos, users, and attachments. Also replace and modify
// the normalization functions which are used to normalize the data.
const repos = [
  {
    itemType: 'todos',
    normalize: normalizeTodo,
  },
  {
    itemType: 'users',
    normalize: normalizeUser,
  },
  {
    itemType: 'attachments',
    normalize: normalizeAttachment,
  },
];

// TODO: Replace with item types you want to extract from the external system.
// Also replace the extract functions with the actual functions that will be
// used to extract the data. You can use this to easier iterate over the item
// types and extract them.
interface ItemTypeToExtract {
  name: 'todos' | 'users' | 'attachments';
  extractFunction: (client: HttpClient) => Promise<any[]>;
}

const itemTypesToExtract: ItemTypeToExtract[] = [
  {
    name: 'todos',
    extractFunction: (client: HttpClient) => client.getTodos(),
  },
  {
    name: 'users',
    extractFunction: (client: HttpClient) => client.getUsers(),
  },
  {
    name: 'attachments',
    extractFunction: (client: HttpClient) => client.getAttachments(),
  },
];

// Function to make a single request to DevRev API works.list endpoint
async function makeDevRevRequest(token: string, requestId: number): Promise<any> {
  try {
    const response = await fetch('https://api.devrev.ai/works.list', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Extract rate limit headers
    const rateLimit = {
      limit: response.headers.get('X-Ratelimit-Limit'),
      remaining: response.headers.get('X-Ratelimit-Remaining'),
      reset: response.headers.get('X-Ratelimit-Reset'),
    };

    if (!response.ok) {
      return { requestId, status: response.status, rateLimit };
    }

    return { requestId, status: response.status, rateLimit };
  } catch (error) {
    return { requestId, error: error instanceof Error ? error.message : String(error) };
  }
}

processTask<ExtractorState>({
  task: async ({ adapter }) => {
    adapter.initializeRepos(repos);

    // Get the DevRev API token from the event context
    const devrevToken = adapter.event.context.secrets?.service_account_token;

    if (!devrevToken) {
      throw new Error('DevRev API token not found in event context');
    }

    // Create many requests in batches to hit rate limits
    const totalRequests = 10000;
    const batchSize = 1000;
    const results: any[] = [];

    // Start periodic rate limit logging
    let lastRateLimit: any = null;
    const logInterval = setInterval(() => {
      if (lastRateLimit) {
        const resetTime = lastRateLimit.reset
          ? new Date(parseInt(lastRateLimit.reset) * 1000).toISOString()
          : 'unknown';
        console.log(
          `Rate Limit Status - Limit: ${lastRateLimit.limit}, Remaining: ${lastRateLimit.remaining}, Reset: ${resetTime}`
        );
      }
    }, 3000); // Log every 3 seconds

    // Execute requests in batches with small delays
    for (let batch = 0; batch < Math.ceil(totalRequests / batchSize); batch++) {
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, totalRequests);

      console.log(`Executing batch ${batch + 1}, requests ${batchStart + 1}-${batchEnd}`);

      const batchPromises: Promise<any>[] = [];
      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(makeDevRevRequest(devrevToken, i + 1));
      }

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Update rate limit info from this batch
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.rateLimit) {
          lastRateLimit = result.value.rateLimit;
        }
      });

      // Small delay between batches to allow monitoring
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Stop the logging interval
    clearInterval(logInterval);

    // Count rate limit responses and collect rate limit info
    let rateLimitCount = 0;
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const response = result.value;
        if (response.rateLimit) {
          lastRateLimit = response.rateLimit;
        }
        if (response.status === 429) {
          rateLimitCount++;
        }
      }
    });

    // Final rate limit status
    if (lastRateLimit) {
      const resetTime = lastRateLimit.reset ? new Date(parseInt(lastRateLimit.reset) * 1000).toISOString() : 'unknown';
      console.log(
        `Final Rate Limit Status - Limit: ${lastRateLimit.limit}, Remaining: ${lastRateLimit.remaining}, Reset: ${resetTime}`
      );
    }

    console.log(`Rate limit hits: ${rateLimitCount} out of ${totalRequests} requests`);

    // Continue with original extraction logic if needed
    const httpClient = new HttpClient(adapter.event);

    // TODO: Replace with your implementation to extract data from the external
    // system. This is just an example how you can iterate over the item types,
    // extract them, push them to the repo, and save the state.
    for (const itemTypeToExtract of itemTypesToExtract) {
      const items = await itemTypeToExtract.extractFunction(httpClient);
      await adapter.getRepo(itemTypeToExtract.name)?.push(items);
      adapter.state[itemTypeToExtract.name].completed = true;
    }

    await adapter.emit(ExtractorEventType.ExtractionDataDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.ExtractionDataProgress);
  },
});
