# Context7 Topic: Testing Playbook

Call this doc via Context7 (`topic="testing-playbook"`) when you need to recall required Jest config, coverage targets, or recommended test cases for an AirSync snap-in.

---

## 1. Jest Configuration Template

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/?(*.)+(test|spec).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      statements: 60,
      lines: 60,
      functions: 60,
    },
  },
  testTimeout: 10_000,
  verbose: true,
};
```

**Command sequence**
```bash
npm test -- --coverage
npm run lint
npm run build
```

---

## 2. Required Test Suites

| Component | Required Tests | Notes |
| --- | --- | --- |
| HTTP Client | Auth header injection, pagination params, 429 handling (sleep vs delay), exponential backoff, dedicated endpoints (e.g., `/comments`). | Mock Axios; verify headers and retry timing. |
| Normalizers | Each entity type (users/issues/comments/artifacts). Ensure required fields exist, fallback logic works, and parent IDs are set. | Use plain objects; no HTTP needed. |
| Extractor Helpers | State resumption (page ↔ timestamp), comment harvesting logic, artifact collection, `pickLatestTimestamp`. | Import helper functions via exported `__testables`. |
| Integration (optional but recommended) | Live smoke test (skip if `.env` missing) verifying real API counts or invariants. | Condition tests on env presence to avoid CI failures. |

---

## 3. Coverage Strategy

1. **Focus coverage on non-trivial modules** (`http-client`, normalization, extraction helpers).  
2. **Exclude** generated entry points (`src/main.ts`, `function-factory.ts`) from coverage to save context.  
3. **Instrument** complex branches (e.g., rate-limit logic) with dedicated tests so the 80% branch requirement is met.  
4. **Document** coverage checkpoints after major milestones (HTTP client done, normalization done, etc.).

---

## 4. Integration Test Pattern

```ts
const hasEnv = Boolean(process.env.EXTERNAL_KEY);
const describeOrSkip = hasEnv ? describe : describe.skip;

describeOrSkip('Live API check', () => {
  it('fetches at least N comments', async () => {
    const client = new HttpClient(buildEvent());
    const comments = await fetchComments(client);
    expect(comments.length).toBeGreaterThanOrEqual(4);
  });
});

if (!hasEnv) {
  console.warn('Skipping live test; env vars missing.');
}
```

Guidelines:
- Keep these tests short (single API path + assertion).
- Fail fast with descriptive errors to aid debugging.
- Clean up any temp files (fixtures) after the test run.

---

## 5. Developer Experience Tips

- **ts-jest**: ensure `tsconfig.json` includes test files or a separate `tsconfig.eslint.json` exists for linting.  
- **Mocks**: use `jest.mock('axios')` for HTTP client tests; reset mocks between cases.  
- **Integration gating**: use `process.env.CI` to skip tests in automated pipelines if they require secrets.  
- **Logging**: integration tests should log counts/results so manual runs provide immediate feedback (e.g., `console.table` of entity totals).

---

This playbook keeps the testing footprint consistent across projects. Pull it into context when you need concrete examples or reminders about coverage and integration patterns.***
