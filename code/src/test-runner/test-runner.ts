import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { AirdropEvent, createMockEvent, DeepPartial, EventType, MockServer } from '@devrev/ts-adaas';

import { functionFactory, FunctionFactoryType } from '../function-factory';

export interface LocalRunnerProps {
  fixturePath: string;
  functionName?: FunctionFactoryType;
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

export const testRunner = async ({ fixturePath, functionName }: LocalRunnerProps) => {
  dotenv.config();

  const fixturesDir = path.resolve(__dirname, '../../fixtures', fixturePath);
  if (!fs.existsSync(fixturesDir)) {
    throw new Error(`Fixture directory not found: ${fixturesDir}`);
  }
  return runWithFixtureDir(fixturesDir, functionName);
};

function getFunctionName(event_type: string): FunctionFactoryType {
  if (event_type.indexOf('EXTRACT') != -1) {
    return 'extraction';
  } else if (event_type.indexOf('LOAD') != -1) {
    return 'loading';
  }

  throw new Error(`No functionName found for event ${event_type}. Specify functionName using '--functionName' parameter.`);
}

async function runWithFixtureDir(fixturesDir: string, functionName?: FunctionFactoryType) {
  const eventPath = path.join(fixturesDir, 'event.json');
  const statePath = path.join(fixturesDir, 'state.json');
  const extractionScopePath = path.join(fixturesDir, 'extraction_scope.json');

  const fixtureEvent = readFixtureFile<DeepPartial<AirdropEvent>>(eventPath);
  const fixtureState = readFixtureFile<Record<string, unknown>>(statePath);
  const fixtureExtractionScope = readFixtureFile<Record<string, unknown>>(extractionScopePath);

  if (!fixtureEvent) {
    throw new Error(
      `Missing or empty event.json in fixture directory: ${eventPath}. ` +
      'Every fixture must have an event.json with at least an "event_type" field.'
    );
  }

  if (!fixtureEvent.payload?.event_type) {
    throw new Error(
      `event.json at ${eventPath} is missing the required "event_type" field. ` +
      'Specify an event type such as "START_EXTRACTING_DATA" or "START_EXTRACTING_EXTERNAL_SYNC_UNITS".'
    );
  }

  const resolvedFunctionName = functionName ?? getFunctionName(fixtureEvent.payload?.event_type);

  if (!resolvedFunctionName) {
    throw new Error(
      'No function name provided. Either pass --functionName on the CLI ' + 'or set "function_name" in event.json.'
    );
  }

  if (!(resolvedFunctionName in functionFactory)) {
    throw new Error(
      `Function "${resolvedFunctionName}" not found in functionFactory. ` +
      `Available: ${Object.keys(functionFactory).join(', ')}`
    );
  }

  const eventType = resolveEventType(fixtureEvent.payload?.event_type);

  console.log(`[test-runner] Function : ${resolvedFunctionName}`);
  console.log(`[test-runner] Event    : ${eventType}`);
  console.log(`[test-runner] Fixture  : ${fixturesDir}`);

  const mockServer = new MockServer(0);
  await mockServer.start();

  console.log(`[test-runner] MockServer started on ${mockServer.baseUrl}`);

  mockServer.setRoute({
    path: '/worker_data_url.get',
    method: 'GET',
    status: 200,
    body: {
      state: JSON.stringify(fixtureState ?? {}),
      objects: JSON.stringify(fixtureExtractionScope ?? {}),
    },
  });

  if (fixtureState) {
    console.log(`[test-runner] Injected state from state.json`);
  } else {
    console.log(`[test-runner] No state.json found — using default empty state`);
  }

  if (fixtureExtractionScope) {
    console.log(`[test-runner] Injected extraction scope from extraction_scope.json`);
  } else {
    console.log(`[test-runner] No extraction_scope.json found — using default all-extract scope`);
  }

  const event = createMockEvent(mockServer.baseUrl, fixtureEvent);

  process.argv.push('--local');

  const run = functionFactory[resolvedFunctionName];

  try {
    await run([event]);
    console.log(`[test-runner] Function completed successfully`);
  } catch (err) {
    console.error(`[test-runner] Function threw an error:`, err);
    process.exitCode = 1;
  } finally {
    await mockServer.stop();
    console.log(`[test-runner] MockServer stopped`);
  }
}
