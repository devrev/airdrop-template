import * as fs from 'fs';
import * as path from 'path';

import { AirdropEvent, EventType, MockServer } from '@devrev/ts-adaas';

import { functionFactory, FunctionFactoryType } from '../function-factory';

/**
 * Shape of the event_context.json fixture file.
 * Only `event_type` is required — everything else has sensible defaults.
 * `function_name` can be provided here to avoid passing --functionName on the CLI.
 */
export interface FixtureEventContext {
  /** Which event to simulate, e.g. "START_EXTRACTING_EXTERNAL_SYNC_UNITS" */
  event_type: string;

  /** Optional — can also be passed via --functionName CLI flag */
  function_name?: FunctionFactoryType;

  /** Override connection_data fields */
  connection_data?: {
    org_id?: string;
    org_name?: string;
    key?: string;
    key_type?: string;
  };

  /** Override any event_context fields (dev_oid, import_slug, etc.) */
  event_context_overrides?: Record<string, unknown>;
}

export interface TestRunnerProps {
  /** Folder name inside code/fixtures/ */
  fixturePath: string;
  /** Which function to run — overrides event_context.json's function_name if set */
  functionName?: FunctionFactoryType;
}

/**
 * Reads a JSON file from the fixture directory. Returns `undefined` if the file
 * is missing or empty (0 bytes).
 */
function readFixtureFile<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (raw.length === 0) {
    return undefined;
  }
  return JSON.parse(raw) as T;
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

  throw new Error(
    `Unknown event_type "${input}". Must be one of: ${Object.values(EventType).join(', ')}`
  );
}

/**
 * Build a complete AirdropEvent with all URLs pointing at the MockServer.
 */
function buildEvent(
  mockServerBaseUrl: string,
  eventType: EventType,
  fixtureEventContext?: FixtureEventContext
): AirdropEvent {
  const connectionData = {
    org_id: 'test_org_id',
    org_name: 'test_org_name',
    key: 'test_key',
    key_type: 'test_key_type',
    ...fixtureEventContext?.connection_data,
  };

  const eventContext = {
    callback_url: `${mockServerBaseUrl}/callback_url`,
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
    worker_data_url: `${mockServerBaseUrl}/worker_data_url`,
    ...fixtureEventContext?.event_context_overrides,
  };

  return {
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
      event_data: {},
    },
    execution_metadata: {
      devrev_endpoint: mockServerBaseUrl,
    },
    input_data: {
      global_values: {},
      event_sources: {},
    },
  } as AirdropEvent;
}

export const testRunner = async ({
  fixturePath,
  functionName,
}: TestRunnerProps) => {
  // ---------------------------------------------------------------------------
  // 1. Resolve fixture directory
  // ---------------------------------------------------------------------------
  const fixturesDir = path.resolve(__dirname, '..', 'fixtures', fixturePath);
  if (!fs.existsSync(fixturesDir)) {
    // Also try from the code/fixtures location (when running compiled dist/)
    const altDir = path.resolve(
      __dirname,
      '..',
      '..',
      'fixtures',
      fixturePath
    );
    if (!fs.existsSync(altDir)) {
      throw new Error(
        `Fixture directory not found: ${fixturesDir} (also tried ${altDir})`
      );
    }
    // use altDir
    return runWithFixtureDir(altDir, functionName);
  }
  return runWithFixtureDir(fixturesDir, functionName);
};

async function runWithFixtureDir(
  fixturesDir: string,
  functionName?: FunctionFactoryType
) {
  // ---------------------------------------------------------------------------
  // 2. Read fixture files
  // ---------------------------------------------------------------------------
  const eventContextPath = path.join(fixturesDir, 'event_context.json');
  const statePath = path.join(fixturesDir, 'state.json');

  const fixtureEventContext = readFixtureFile<FixtureEventContext>(eventContextPath);
  const fixtureState = readFixtureFile<Record<string, unknown>>(statePath);

  // ---------------------------------------------------------------------------
  // 3. Determine function name and event type
  // ---------------------------------------------------------------------------
  const resolvedFunctionName =
    functionName ?? fixtureEventContext?.function_name;

  if (!resolvedFunctionName) {
    throw new Error(
      'No function name provided. Either pass --functionName on the CLI ' +
        'or set "function_name" in event_context.json.'
    );
  }

  if (!functionFactory[resolvedFunctionName]) {
    throw new Error(
      `Function "${resolvedFunctionName}" not found in functionFactory. ` +
        `Available: ${Object.keys(functionFactory).join(', ')}`
    );
  }

  const eventTypeStr =
    fixtureEventContext?.event_type ?? 'START_EXTRACTING_EXTERNAL_SYNC_UNITS';
  const eventType = resolveEventType(eventTypeStr);

  console.log(`[fixture] Function : ${resolvedFunctionName}`);
  console.log(`[fixture] Event    : ${eventType}`);
  console.log(`[fixture] Fixture  : ${fixturesDir}`);

  // ---------------------------------------------------------------------------
  // 4. Start MockServer
  // ---------------------------------------------------------------------------
  const mockServer = new MockServer(0);
  await mockServer.start();

  console.log(`[fixture] MockServer started on ${mockServer.baseUrl}`);

  // ---------------------------------------------------------------------------
  // 5. Inject state from state.json
  // ---------------------------------------------------------------------------
  if (fixtureState) {
    mockServer.setRoute({
      path: '/worker_data_url.get',
      method: 'GET',
      status: 200,
      body: { state: JSON.stringify(fixtureState) },
    });
    console.log(`[fixture] Injected state from state.json`);
  } else {
    console.log(`[fixture] No state.json found (or empty) — using default empty state`);
  }

  // ---------------------------------------------------------------------------
  // 6. Build event and run the function
  // ---------------------------------------------------------------------------
  const event = buildEvent(mockServer.baseUrl, eventType, fixtureEventContext);

  const run = functionFactory[resolvedFunctionName];

  try {
    await run([event]);
    console.log(`[fixture] Function completed successfully`);
  } catch (err) {
    console.error(`[fixture] Function threw an error:`, err);
    process.exitCode = 1;
  } finally {
    await mockServer.stop();
    console.log(`[fixture] MockServer stopped`);
  }
}
