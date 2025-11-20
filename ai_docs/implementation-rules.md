# Context7 Topic: AirSync Implementation Rules (Tier 2)

Use this page when you need concrete guidance on repositories, state management, emit patterns, or rate-limit handling. To pull this doc into context, run the Context7 tool with `topic="implementation-rules"` (or equivalent in your workflow).

---

## 1. Repository & Emit Contract

| Step | Rule | Snippet |
| --- | --- | --- |
| Initialize | Call `adapter.initializeRepos([{ itemType, normalize }])` before pushing data. Skip normalization only for `external_domain_metadata` or raw attachments. | ```ts\nadapter.initializeRepos([\n  { itemType: 'users', normalize: normalizeUser },\n  { itemType: 'issues', normalize: normalizeIssue },\n]);\n``` |
| Push | Use `await adapter.getRepo(itemType)?.push(items);` after each batch/page. Repos automatically batch uploads. | ```ts\nif (pageItems.length) {\n  await adapter.getRepo('issues')?.push(pageItems);\n}\n``` |
| Emit | Exactly one emit per extraction phase (`ExtractionDataDone`, `ExtractionDataDelay`, or `ExtractionDataError`). Emit only after flushing repos. | ```ts\nawait adapter.emit(ExtractorEventType.ExtractionDataDone);\n``` |

---

## 2. State Template

```ts
interface EntityState {
  next_page: number;
  last_updated_timestamp?: string;
  last_id?: string;
}

interface ExtractorState {
  users: EntityState;
  epics: EntityState;
  // add per-entity entries as needed
}

const initialExtractorState: ExtractorState = {
  users: { next_page: 1 },
  epics: { next_page: 1 },
  // ...
};
```

**Best Practices**
- Store only what you need to resume (page, timestamps, maybe last processed ID).
- When a page returns no items, reset `next_page` back to `1` for the next run.
- Save timestamps in ISO8601 and reuse them with `updated_since`.

---

## 3. Pagination & Enrichment Loop

```ts
let page = state.entity.next_page ?? 1;
while (true) {
  const response = await client.listEntities({ page, per_page: 30, updated_since });
  const summaries = response.entities ?? [];
  if (!summaries.length) { state.entity.next_page = 1; break; }

  for (const summary of summaries) {
    const detail = await client.getEntity(summary.id);
    await repo.push([detail]);
    // collect child records (comments/attachments) here
  }

  state.entity.next_page = ++page;
}
```

Key points:
- Always honor `per_page = 30` (or the platform’s required value).
- Enrich each summary via the per-id endpoint before emitting or gathering child objects.
- Insert child processing (comments/artifacts) right after fetching detail, so every page stays self-contained.

---

## 4. Rate Limiting & Error Retry Pattern

```ts
async function requestWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (is429(error)) {
        const delay = parseRetryAfter(error);
        if (delay > 60_000) throw new RateLimitDelayError(delay);
        await sleep(delay);
        continue;
      }
      if (isRetryable(error) && attempt < 2) {
        await sleep(2 ** attempt * 1000);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Exhausted retries');
}
```

- **`parseRetryAfter`**: check `Retry-After` header (seconds or HTTP-date). Fallback to `X-RateLimit-Reset`.
- **Delay policy**: `<= 60s` → `sleep`; `>60s` → raise `RateLimitDelayError` so the worker can emit `ExtractionDataDelay`.
- **Other 4xx/5xx**: exponential backoff (1s, 2s, 4s). Log a warning each time.

---

## 5. Comments & Attachments

1. **Comments**
   - If the detail payload only provides `comments_count`, call the dedicated `/entity/{id}/comments` endpoint.
   - Collect them by paging until `current_page === total_pages`.
   - Normalize using `{ body, author_id, parent_id, parent_type, timestamps }`.

2. **Attachments**
   - Detail payloads usually contain attachment metadata (`download_url`, `file_name`).
   - Store IDs + URLs in the `attachments` repo; actual file streaming happens via the default attachments worker.

---

## 6. Integration Hooks

- To verify counts or run one-off checks, create small scripts that instantiate the HTTP client with `.env` credentials and output totals. Keep these scripts separate from the extraction flow, so lack of a worker state endpoint doesn’t block local testing.
- Integration tests can be conditionally executed (skip if env vars missing) but should assert critical invariants (e.g., “at least N comments fetched via comment endpoint”).

---

## 6. Integration Helpers

- To sanity-check live counts, either run a small Node/ts-node script with `.env` credentials or leverage the `http-rquest` MCP server for one-off calls (e.g., `GET /features/{id}/comments`).  
- Gate any networked Jest tests with `describe.skip` unless required env vars exist.  
- Log totals (via `console.table`) during manual runs so product owners can verify entity counts quickly.

---

Use this doc whenever you need the “how” behind the Tier‑1 rules. Fetch it via Context7 to keep the immediate prompt lightweight.***
