import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { AirdropEvent, ConnectionData, EventContext, EventData, EventType, MockServer } from '@devrev/ts-adaas';

import { functionFactory, FunctionFactoryType } from '../function-factory';

/**
 * Shape of the `airdrop_message.json` fixture file.
 *
 * Mirrors the SDK's {@link AirdropMessage} with two differences:
 *  - Every field except `event_type` is optional (defaults are provided).
 *  - `function_name` is an extra runner-only field (not part of AirdropMessage)
 *    that selects which snap-in function to invoke.
 */
export interface FixtureAirdropMessage {
  /** Which event to simulate, e.g. "START_EXTRACTING_DATA" (required). */
  event_type: string;

  /** Runner-only: which function to call. Can also be set via --functionName CLI flag. */
  function_name?: FunctionFactoryType;

  /** Partial connection data — merged with test defaults. */
  connection_data?: Partial<ConnectionData>;

  /** Partial event context — merged with test defaults. MockServer URLs are always injected. */
  event_context?: Partial<EventContext>;

  /** Optional event data — passed through as-is (defaults to {}). */
  event_data?: Partial<EventData>;
}

export interface TestRunnerProps {
  /** Folder name inside code/fixtures/ */
  fixturePath: string;
  /** Which function to run — overrides airdrop_message.json's function_name if set */
  functionName?: FunctionFactoryType;
  /** Print the adapter state on every worker_data_url.update call */
  printState?: boolean;
}

/**
 * Replace all `${VAR_NAME}` placeholders in a string with values from
 * `process.env`. Throws if a referenced variable is not set.
 * Values are JSON-escaped so that special characters (quotes, backslashes, etc.)
 * don't break the JSON structure.
 */
function resolveEnvVariables(raw: string, filePath: string): string {
  return raw.replace(/\$\{(\w+)\}/g, (_match, varName: string) => {
    const value = process.env[varName];
    if (value === undefined) {
      throw new Error(
        `Environment variable "${varName}" referenced in ${filePath} is not set. ` +
          'Make sure it is defined in your .env file or exported in your shell.'
      );
    }
    // JSON.stringify adds surrounding quotes and escapes special chars.
    // Slice off the quotes since the placeholder is already inside a JSON string value.
    return JSON.stringify(value).slice(1, -1);
  });
}

/**
 * Reads a JSON file from the fixture directory. Returns `undefined` if the file
 * is missing or empty (0 bytes). Supports `${ENV_VAR}` placeholders that are
 * resolved from `process.env` before parsing.
 */
function readFixtureFile<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (raw.length === 0) {
    return undefined;
  }
  const resolved = resolveEnvVariables(raw, filePath);
  return JSON.parse(resolved) as T;
}

/**
 * Resolve the EventType enum value from a string.
 * Accepts both the enum key ("StartExtractingData") and the enum value
 * ("START_EXTRACTING_DATA").
 */
function resolveEventType(input: string): EventType {
  // Check if it matches an enum value directly (e.g. "START_EXTRACTING_DATA")
  const byValue = Object.values(EventType).find((v) => v === input);
  if (byValue) return byValue as EventType;

  // Check if it matches an enum key (e.g. "StartExtractingData")
  const byKey = (EventType as Record<string, string>)[input];
  if (byKey) return byKey as EventType;

  throw new Error(`Unknown event_type "${input}". Must be one of: ${Object.values(EventType).join(', ')}`);
}

/**
 * Build a complete AirdropEvent with all URLs pointing at the MockServer.
 * Fields from the fixture's airdrop_message.json are merged into the
 * appropriate sections, with MockServer URLs always taking precedence.
 */
function buildEvent(mockServerBaseUrl: string, eventType: EventType, fixture?: FixtureAirdropMessage): AirdropEvent {
  const connectionData: ConnectionData = {
    org_id: 'test_org_id',
    org_name: 'test_org_name',
    key: 'test_key',
    key_type: 'test_key_type',
    ...fixture?.connection_data,
  };

  const eventContext: EventContext = {
    dev_org: 'test_dev_org',
    dev_oid: 'test_dev_oid',
    dev_org_id: 'test_dev_org_id',
    dev_user: 'test_dev_user',
    dev_user_id: 'test_dev_user_id',
    dev_uid: 'test_dev_uid',
    event_type_adaas: 'test_event_type_adaas',
    external_sync_unit: 'test_external_sync_unit',
    external_sync_unit_id: 'test_external_sync_unit_id',
    external_sync_unit_name: 'test_external_sync_unit_name',
    external_system: 'test_external_system',
    external_system_id: 'test_external_system_id',
    external_system_name: 'test_external_system_name',
    external_system_type: 'test_external_system_type',
    import_slug: 'test_import_slug',
    mode: 'INITIAL',
    request_id: 'test_request_id',
    request_id_adaas: 'test_request_id_adaas',
    run_id: 'test_run_id',
    sequence_version: 'test_sequence_version',
    snap_in_slug: 'test_snap_in_slug',
    snap_in_version_id: 'test_snap_in_version_id',
    sync_run: 'test_sync_run',
    sync_run_id: 'test_sync_run_id',
    sync_tier: 'test_sync_tier',
    sync_unit: 'test_sync_unit',
    sync_unit_id: 'test_sync_unit_id',
    uuid: 'test_uuid',
    // Fixture overrides are spread here — user-provided event_context fields
    // take precedence over the test defaults above.
    ...fixture?.event_context,
    // MockServer URLs are always set last so they can't be accidentally
    // overridden — the function must talk to the mock, not a real endpoint.
    callback_url: `${mockServerBaseUrl}/callback_url`,
    worker_data_url: `${mockServerBaseUrl}/worker_data_url`,
  };

  const event: AirdropEvent = {
    context: {
      secrets: {
        service_account_token: 'test_service_account_token',
      },
      snap_in_version_id: 'test_snap_in_version_id',
      snap_in_id: 'test_snap_in_id',
    },
    payload: {
      connection_data: connectionData,
      event_context: eventContext,
      event_type: eventType,
      event_data: fixture?.event_data ?? {},
    },
    execution_metadata: {
      devrev_endpoint: mockServerBaseUrl,
    },
    input_data: {
      global_values: {},
      event_sources: {},
    },
  };

  return event;
}

export const testRunner = async ({ fixturePath, functionName, printState }: TestRunnerProps) => {
  dotenv.config();

  // Resolve fixture directory from project root (process.cwd())
  const fixturesDir = path.resolve(process.cwd(), 'fixtures', fixturePath);
  if (!fs.existsSync(fixturesDir)) {
    throw new Error(`Fixture directory not found: ${fixturesDir}`);
  }
  return runWithFixtureDir(fixturesDir, functionName, printState);
};

/**
 * Print all state updates that were posted to the MockServer during the run.
 * Each POST to /worker_data_url.update carries `{ state: "<JSON string>" }`.
 */
function printStateUpdates(mockServer: MockServer): void {
  const requests = mockServer.getRequests('POST', '/worker_data_url.update');
  if (requests.length === 0) {
    console.log(`[fixture:state] No state updates were posted during this run.`);
    return;
  }

  console.log(`[fixture:state] ${requests.length} state update(s) during this run:`);
  for (let i = 0; i < requests.length; i++) {
    const body = requests[i].body as { state?: string } | undefined;
    if (body?.state) {
      try {
        const parsed = JSON.parse(body.state);
        console.log(`[fixture:state] Update #${i + 1}:`);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(`[fixture:state] Update #${i + 1} (raw): ${body.state}`);
      }
    }
  }
}

async function runWithFixtureDir(fixturesDir: string, functionName?: FunctionFactoryType, printState?: boolean) {
  const airdropMessagePath = path.join(fixturesDir, 'airdrop_message.json');
  const statePath = path.join(fixturesDir, 'state.json');

  const fixtureMessage = readFixtureFile<FixtureAirdropMessage>(airdropMessagePath);
  const fixtureState = readFixtureFile<Record<string, unknown>>(statePath);

  if (!fixtureMessage) {
    throw new Error(
      `Missing or empty airdrop_message.json in fixture directory: ${airdropMessagePath}. ` +
        'Every fixture must have an airdrop_message.json with at least an "event_type" field.'
    );
  }

  if (!fixtureMessage.event_type) {
    throw new Error(
      `airdrop_message.json at ${airdropMessagePath} is missing the required "event_type" field. ` +
        'Specify an event type such as "START_EXTRACTING_DATA" or "START_EXTRACTING_EXTERNAL_SYNC_UNITS".'
    );
  }

  // Determine function name and event type
  const resolvedFunctionName = functionName ?? fixtureMessage.function_name;

  if (!resolvedFunctionName) {
    throw new Error(
      'No function name provided. Either pass --functionName on the CLI ' +
        'or set "function_name" in airdrop_message.json.'
    );
  }

  if (!functionFactory[resolvedFunctionName]) {
    throw new Error(
      `Function "${resolvedFunctionName}" not found in functionFactory. ` +
        `Available: ${Object.keys(functionFactory).join(', ')}`
    );
  }

  const eventType = resolveEventType(fixtureMessage.event_type);

  console.log(`[fixture] Function : ${resolvedFunctionName}`);
  console.log(`[fixture] Event    : ${eventType}`);
  console.log(`[fixture] Fixture  : ${fixturesDir}`);

  // Start MockServer
  const mockServer = new MockServer(0);
  await mockServer.start();

  console.log(`[fixture] MockServer started on ${mockServer.baseUrl}`);

  // Inject state from state.json (or default to empty state)
  mockServer.setRoute({
    path: '/worker_data_url.get',
    method: 'GET',
    status: 200,
    body: { state: JSON.stringify(fixtureState ?? {}) },
  });
  if (fixtureState) {
    console.log(`[fixture] Injected state from state.json`);
  } else {
    console.log(`[fixture] No state.json found (or empty) — using default empty state`);
  }

  // Build event and run the function
  const event = buildEvent(mockServer.baseUrl, eventType, fixtureMessage);

  const run = functionFactory[resolvedFunctionName];

  try {
    await run([event]);
    console.log(`[fixture] Function completed successfully`);
  } catch (err) {
    console.error(`[fixture] Function threw an error:`, err);
    process.exitCode = 1;
  } finally {
    if (printState) {
      printStateUpdates(mockServer);
    }
    await mockServer.stop();
    console.log(`[fixture] MockServer stopped`);
  }
}
