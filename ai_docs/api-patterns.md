# Context7 Topic: API Patterns & Resilience

Fetch this doc with Context7 (`topic="api-patterns"`) when you need concrete guidance on pagination, rate limiting, retries, or error handling for external APIs.

---

## 1. Pagination Template

| Requirement | Pattern |
| --- | --- |
| Fixed page size | Explicitly pass `per_page` (use 30 unless the API demands another value). |
| Cursor state | Track `next_page` and `last_updated_timestamp` per entity in adapter state. Reset `next_page` to `1` when the API returns zero items or we reach the final page. |
| Sequential processing | Never parallelize page fetches; process page → enrich → push → move on. This keeps state consistent and avoids double-processing. |

**Code Skeleton**
```ts
async function pageLoop(fetchPage: (page: number) => Promise<PageResponse>) {
  let page = state.next_page ?? 1;
  while (true) {
    const response = await fetchPage(page);
    const items = response.items ?? [];
    if (!items.length) { state.next_page = 1; break; }
    for (const summary of items) {
      const detail = await getDetail(summary.id);
      await repo.push([detail]);
    }
    if (page >= (response.pagination?.total_pages ?? page)) {
      state.next_page = 1;
      break;
    }
    state.next_page = ++page;
  }
}
```

---

## 2. Rate Limiting Playbook

| Scenario | Action |
| --- | --- |
| HTTP 429 with `Retry-After` seconds | Sleep that many seconds (minimum 1s). |
| HTTP 429 with HTTP-date | Convert to milliseconds, subtract current time, clamp to ≥1s. |
| No header but `X-RateLimit-Reset` present | Convert epoch seconds to delay. |
| Delay > 60s | Throw `RateLimitDelayError(delayMs)` so the worker emits `ExtractionDataDelay`. |
| Other retryable errors (501-599, 408, etc.) | Warn + exponential backoff (1s, 2s, 4s). |

**Helper**
```ts
function getRetryDelay(headers: RawAxiosResponseHeaders): number {
  // 1) Retry-After seconds
  // 2) Retry-After HTTP date
  // 3) X-RateLimit-Reset epoch
  // 4) Default 2000ms
}
```

---

## 3. Error Handling Matrix

| Error Type | Retry? | Notes |
| --- | --- | --- |
| 400/404 | ❌ | Likely client input issue. Log and throw. |
| 401/403 | ❌ | Credentials/permissions problem; abort extraction. |
| 408/429 | ✅ | Follow rate-limit rules above. |
| 5xx | ✅ | Retry with backoff (3 attempts). |
| Network/DNS | ✅ | Treat as retryable unless repeated 3 times. |

Always log context: endpoint, status, request ID if available. Use structured logs so issues are searchable.

---

## 4. Comments & Child Collections

Some APIs expose lightweight parent records (e.g., features) and require separate calls for comments or attachments. Pattern:
1. Fetch parent detail → note `comments_count` or equivalent.
2. If `count > 0`, call `/parent/{id}/comments?page=n` until empty.
3. Normalize each comment with `body`, `author`, `created_at`, `parent_id`, `parent_type`.
4. During discovery, use the `http-rquest` MCP server to hit those comment endpoints manually; inspect headers, sample payloads, and pagination structure before writing code.

This ensures comments are never “missing” even when detail payloads omit them.

---

## 5. Utility Snippets

### Axios Request Wrapper
```ts
async function request<T>(config: AxiosRequestConfig, attempt = 0): Promise<T> {
  try {
    const { data } = await axios.request<T>(config);
    return data;
  } catch (error) {
    if (is429(error)) { /* handle via getRetryDelay */ }
    if (isRetryable(error) && attempt < 3) {
      await sleep(2 ** attempt * 1000);
      return request(config, attempt + 1);
    }
    throw error;
  }
}
```

### Sleep Helper
```ts
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
```

---

Use this doc whenever you’re uncertain about request pacing, pagination shapes, or comment/attachment fetch patterns. Fetch it from Context7 to keep the working prompt small.***
