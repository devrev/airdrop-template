# AirSync Snap-in Quickstart (Tier 1)

Read this file before writing any code. It summarizes the non‑negotiable rules and points you to the deeper references stored under `ai_docs/`.

---

## 1. Prerequisite Checklist
- ✅ Verify template integrity (test harness files exist under `code/test/`).
- ✅ Validate `external_domain_metadata.json` + `initial_domain_mapping.json` with the AirSync MCP server (`AirSync.use_mapping`).
- ✅ Confirm `.env` (or equivalent secrets) is available before attempting integration tests.

## 2. Mandatory Behaviors
1. **MCP Usage**  
   - Always use the `AirSync` MCP tools (`map_field`, `map_record_type`, `use_mapping`) for schema/mapping changes. Do **not** call `chef-cli`.  
   - Use the `http-rquest` MCP server for ad-hoc HTTP calls (e.g., probing `/features/{id}/comments`). Keep it for discovery/troubleshooting instead of writing throwaway scripts.

2. **HTTP Client & Rate Limits**  
   - Every request includes the connection token and subdomain from `event.payload.connection_data`.  
   - On `429`: parse headers → sleep if ≤60s, emit `ExtractionDataDelay` if >60s.  
   - For other transient 4xx/5xx: warn + exponential backoff (3 tries). Never swallow errors silently.

3. **State & Emits**  
   - Maintain per-entity checkpoints (`next_page`, `last_updated_timestamp`, etc.).  
   - Emit exactly once per extraction phase (`ExtractionDataDone`/`Delay`/`Error`). No per-page emits.  
   - State is for progress only; repositories hold the actual data payloads.

4. **Testing & Coverage**  
   - Jest config must enforce ≥60% statements/lines/functions and ≥80% branches.  
   - Required suite: HTTP client, normalization, state/extractor helpers, plus any integration tests gated on `.env`.  
   - Run `npm test -- --coverage`, `npm run lint`, `npm run build` before sign-off.

5. **Artifacts & Comments**  
   - Artifacts: store attachment IDs + download URLs; streaming occurs later.  
   - Comments: if detail payloads lack the actual bodies, call the per-entity `/comments` endpoints and ingest those.

## 3. How to Dive Deeper
| Topic | AI Doc | Use When… |
| --- | --- | --- |
| Implementation Rules | `ai_docs/implementation-rules.md` | Need repo/emit/state templates |
| API Patterns | `ai_docs/api-patterns.md` | Unsure about pagination, rate limiting, retries |
| Testing Playbook | `ai_docs/testing-playbook.md` | Writing unit/integration tests or configuring Jest |
| Mapping Playbook | `ai_docs/mapping-playbook.md` | Generating/validating metadata & mappings via MCP |

Each Tier‑2 doc includes “How to fetch via Context7” instructions so you can pull it into the model context only when needed, keeping the immediate prompt light.

---

If any requirement seems ambiguous, stop and request clarification before coding. This Tier‑1 file is intentionally brief; consult the Tier‑2 references for detailed guidance and code snippets.***
