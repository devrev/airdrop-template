import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { AirdropEvent, ConnectionData, EventContext, EventData, EventType, MockServer } from '@devrev/ts-adaas';

import { functionFactory, FunctionFactoryType } from '../function-factory';

/**
 * Shape of the `event.json` fixture file.
 *
 * Every field except `event_type` is optional (defaults are provided).
 * `function_name` is a runner-only field that selects which snap-in function
 * to invoke — it is not part of the SDK's AirdropMessage.
 */
export interface FixtureEvent {
  event_type: string;
  function_name?: FunctionFactoryType;
  connection_data?: Partial<ConnectionData>;
  event_context?: Partial<EventContext>;
  event_data?: Partial<EventData>;
}

export interface LocalRunnerProps {
  fixturePath: string;
  functionName?: FunctionFactoryType;
  printState?: boolean;
}

/**
 * Replaces `${VAR_NAME}` placeholders with values from `process.env`.
 * Values are JSON-escaped so special characters don't break the JSON structure.
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
    return JSON.stringify(value).slice(1, -1);
  });
}

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

function resolveEventType(input: string): EventType {
  const match = Object.values(EventType).find((v) => v === input);
  if (match) return match as EventType;

  throw new Error(`Unknown event_type "${input}". Must be one of: ${Object.values(EventType).join(', ')}`);
}

function buildEvent(mockServerBaseUrl: string, eventType: EventType, fixture?: FixtureEvent): AirdropEvent {
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
    ...fixture?.event_context,
    // MockServer URLs must always override fixture values.
    callback_url: `${mockServerBaseUrl}/callback_url`,
    worker_data_url: `${mockServerBaseUrl}/worker_data_url`,
  };

  const event = {
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
  } satisfies AirdropEvent;

  return event;
}

export const localRunner = async ({ fixturePath, functionName, printState }: LocalRunnerProps) => {
  dotenv.config();

  const fixturesDir = path.resolve(__dirname, '../../fixtures', fixturePath);
  if (!fs.existsSync(fixturesDir)) {
    throw new Error(`Fixture directory not found: ${fixturesDir}`);
  }
  return runWithFixtureDir(fixturesDir, functionName, printState);
};

function printStateUpdates(mockServer: MockServer): void {
  const requests = mockServer.getRequests('POST', '/worker_data_url.update');
  if (requests.length === 0) {
    console.log(`[local-runner:state] No state updates were posted during this run.`);
    return;
  }

  console.log(`[local-runner:state] ${requests.length} state update(s) during this run:`);
  for (let i = 0; i < requests.length; i++) {
    const body = requests[i].body as { state?: string } | undefined;
    if (body?.state) {
      try {
        const parsed = JSON.parse(body.state);
        console.log(`[local-runner:state] Update #${i + 1}:`);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(`[local-runner:state] Update #${i + 1} (raw): ${body.state}`);
      }
    }
  }
}

async function runWithFixtureDir(fixturesDir: string, functionName?: FunctionFactoryType, printState?: boolean) {
  const eventPath = path.join(fixturesDir, 'event.json');
  const statePath = path.join(fixturesDir, 'state.json');

  const fixtureMessage = readFixtureFile<FixtureEvent>(eventPath);
  const fixtureState = readFixtureFile<Record<string, unknown>>(statePath);

  if (!fixtureMessage) {
    throw new Error(
      `Missing or empty event.json in fixture directory: ${eventPath}. ` +
        'Every fixture must have an event.json with at least an "event_type" field.'
    );
  }

  if (!fixtureMessage.event_type) {
    throw new Error(
      `event.json at ${eventPath} is missing the required "event_type" field. ` +
        'Specify an event type such as "START_EXTRACTING_DATA" or "START_EXTRACTING_EXTERNAL_SYNC_UNITS".'
    );
  }

  const resolvedFunctionName = functionName ?? fixtureMessage.function_name;

  if (!resolvedFunctionName) {
    throw new Error(
      'No function name provided. Either pass --functionName on the CLI ' + 'or set "function_name" in event.json.'
    );
  }

  if (!functionFactory[resolvedFunctionName]) {
    throw new Error(
      `Function "${resolvedFunctionName}" not found in functionFactory. ` +
        `Available: ${Object.keys(functionFactory).join(', ')}`
    );
  }

  const eventType = resolveEventType(fixtureMessage.event_type);

  console.log(`[local-runner] Function : ${resolvedFunctionName}`);
  console.log(`[local-runner] Event    : ${eventType}`);
  console.log(`[local-runner] Fixture  : ${fixturesDir}`);

  const mockServer = new MockServer(0);
  await mockServer.start();

  console.log(`[local-runner] MockServer started on ${mockServer.baseUrl}`);

  mockServer.setRoute({
    path: '/worker_data_url.get',
    method: 'GET',
    status: 200,
    body: { state: JSON.stringify(fixtureState ?? {}) },
  });
  if (fixtureState) {
    console.log(`[local-runner] Injected state from state.json`);
  } else {
    console.log(`[local-runner] No state.json found — using default empty state`);
  }

  const event = buildEvent(mockServer.baseUrl, eventType, fixtureMessage);
  const run = functionFactory[resolvedFunctionName];

  try {
    await run([event]);
    console.log(`[local-runner] Function completed successfully`);
  } catch (err) {
    console.error(`[local-runner] Function threw an error:`, err);
    process.exitCode = 1;
  } finally {
    if (printState) {
      printStateUpdates(mockServer);
    }
    await mockServer.stop();
    console.log(`[local-runner] MockServer stopped`);
  }
}
