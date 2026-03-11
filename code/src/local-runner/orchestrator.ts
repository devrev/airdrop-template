import crypto from 'crypto';
import { EventType } from '@devrev/ts-adaas';

import { functionFactory } from '../function-factory';
import initialDomainMapping from '../functions/external-system/initial_domain_mapping.json';
import { CallbackEvent, MockDevRevServer } from './mock-devrev-server';
import {
  buildEffectiveIDM,
  createLocalEvent,
  LocalFixture,
} from './event-factory';

export type ExtractionPhase =
  | 'sync-units'
  | 'metadata'
  | 'data'
  | 'attachments';

const ALL_PHASES: ExtractionPhase[] = [
  'sync-units',
  'metadata',
  'data',
  'attachments',
];

/** Map callback event_type strings to their semantic meaning */
const DONE_EVENT_TYPES = new Set([
  'EXTERNAL_SYNC_UNIT_EXTRACTION_DONE',
  'EXTRACTION_EXTERNAL_SYNC_UNITS_DONE',
  'METADATA_EXTRACTION_DONE',
  'EXTRACTION_METADATA_DONE',
  'DATA_EXTRACTION_DONE',
  'EXTRACTION_DATA_DONE',
  'ATTACHMENT_EXTRACTION_DONE',
  'EXTRACTION_ATTACHMENTS_DONE',
]);

const PROGRESS_EVENT_TYPES = new Set([
  'DATA_EXTRACTION_PROGRESS',
  'EXTRACTION_DATA_PROGRESS',
  'ATTACHMENT_EXTRACTION_PROGRESS',
  'EXTRACTION_ATTACHMENTS_PROGRESS',
]);

const ERROR_EVENT_TYPES = new Set([
  'EXTERNAL_SYNC_UNIT_EXTRACTION_ERROR',
  'EXTRACTION_EXTERNAL_SYNC_UNITS_ERROR',
  'METADATA_EXTRACTION_ERROR',
  'EXTRACTION_METADATA_ERROR',
  'DATA_EXTRACTION_ERROR',
  'EXTRACTION_DATA_ERROR',
  'ATTACHMENT_EXTRACTION_ERROR',
  'EXTRACTION_ATTACHMENTS_ERROR',
]);

export interface OrchestratorOptions {
  fixture: LocalFixture;
  server: MockDevRevServer;
  phases?: ExtractionPhase[];
  skipAttachments?: boolean;
}

export interface PhaseResult {
  phase: ExtractionPhase;
  durationMs: number;
  callbackEventType: string;
  error?: string;
  iterations?: number;
}

export interface OrchestratorResult {
  phases: PhaseResult[];
  totalDurationMs: number;
  externalSyncUnits: Array<{ id: string; name: string; description?: string }>;
  success: boolean;
}

/**
 * Orchestrates the extraction phases sequentially.
 * After each phase, reads the callback from the mock server and decides
 * what to do next (continue, move to next phase, or stop on error).
 */
export async function runExtraction({
  fixture,
  server,
  phases,
  skipAttachments,
}: OrchestratorOptions): Promise<OrchestratorResult> {
  const effectivePhases = phases || ALL_PHASES;
  const activePhases = skipAttachments
    ? effectivePhases.filter((p) => p !== 'attachments')
    : effectivePhases;

  const runId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const results: PhaseResult[] = [];
  let externalSyncUnits: Array<{ id: string; name: string; description?: string }> = [];
  let discoveredSyncUnitId: string | undefined;
  const totalStart = Date.now();

  // Build the effective IDM (with overrides merged in) and patch the shared
  // module object in-place. Since Node.js caches modules, this mutation is
  // visible to the connector's `spawn()` call which imports the same JSON file.
  const effectiveIDM = buildEffectiveIDM(fixture);
  if (fixture.mapping_overrides) {
    applyIdmOverrides(initialDomainMapping as Record<string, unknown>, effectiveIDM as unknown as Record<string, unknown>);
    log('Applied mapping overrides to IDM');
  }

  log('Starting local extraction run');
  log(`Run ID: ${runId}`);
  log(`Phases: ${activePhases.join(', ')}`);
  log('');

  for (const phase of activePhases) {
    const phaseStart = Date.now();
    let iterations = 0;
    let lastCallbackType = '';

    try {
      // Determine the initial event type for this phase
      let eventType = getInitialEventType(phase);
      let isDone = false;

      while (!isDone) {
        iterations++;
        server.clearLastCallback();

        const syncUnitId = discoveredSyncUnitId || fixture.external_sync_unit_id;

        log(
          `[${phase}] ${iterations > 1 ? `Continuation #${iterations}` : 'Starting'}...`
        );

        // Create the event
        const event = createLocalEvent({
          fixture,
          eventType,
          mockServerBaseUrl: server.baseUrl,
          externalSyncUnitId: syncUnitId,
          runId,
          requestId,
        });

        // Call the connector's extraction function
        await functionFactory.extraction([event]);

        // Wait for the callback
        const callback = await server.waitForCallback(5 * 60 * 1000);
        lastCallbackType = callback.event_type;

        log(`[${phase}] Callback: ${callback.event_type}`);

        if (ERROR_EVENT_TYPES.has(callback.event_type)) {
          const errorMsg =
            (callback.event_data as any)?.error?.message ||
            'Unknown error';
          logError(`[${phase}] Error: ${errorMsg}`);
          results.push({
            phase,
            durationMs: Date.now() - phaseStart,
            callbackEventType: callback.event_type,
            error: errorMsg,
            iterations,
          });
          // Stop the entire run on error
          return {
            phases: results,
            totalDurationMs: Date.now() - totalStart,
            externalSyncUnits,
            success: false,
          };
        }

        if (DONE_EVENT_TYPES.has(callback.event_type)) {
          isDone = true;

          // After ESU extraction, capture the discovered sync units
          if (phase === 'sync-units') {
            externalSyncUnits = extractSyncUnits(callback);
            if (
              externalSyncUnits.length > 0 &&
              !fixture.external_sync_unit_id
            ) {
              discoveredSyncUnitId = externalSyncUnits[0].id;
              log(
                `[${phase}] Discovered ${externalSyncUnits.length} sync unit(s). Using: "${externalSyncUnits[0].name}" (${discoveredSyncUnitId})`
              );
            }
          }
        } else if (PROGRESS_EVENT_TYPES.has(callback.event_type)) {
          // Need to continue - set the event type to the continuation variant
          eventType = getContinuationEventType(phase);
          log(`[${phase}] Progress - continuing extraction...`);
        } else {
          // Unexpected event type - treat as done with warning
          logWarn(
            `[${phase}] Unexpected callback event type: ${callback.event_type}. Treating as done.`
          );
          isDone = true;
        }
      }

      results.push({
        phase,
        durationMs: Date.now() - phaseStart,
        callbackEventType: lastCallbackType,
        iterations,
      });

      log(
        `[${phase}] Completed in ${Date.now() - phaseStart}ms (${iterations} iteration(s))`
      );
      log('');
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      logError(`[${phase}] Exception: ${errorMsg}`);
      results.push({
        phase,
        durationMs: Date.now() - phaseStart,
        callbackEventType: lastCallbackType,
        error: errorMsg,
        iterations,
      });
      return {
        phases: results,
        totalDurationMs: Date.now() - totalStart,
        externalSyncUnits,
        success: false,
      };
    }
  }

  return {
    phases: results,
    totalDurationMs: Date.now() - totalStart,
    externalSyncUnits,
    success: true,
  };
}

function getInitialEventType(phase: ExtractionPhase): EventType {
  switch (phase) {
    case 'sync-units':
      return EventType.StartExtractingExternalSyncUnits;
    case 'metadata':
      return EventType.StartExtractingMetadata;
    case 'data':
      return EventType.StartExtractingData;
    case 'attachments':
      return EventType.StartExtractingAttachments;
  }
}

function getContinuationEventType(phase: ExtractionPhase): EventType {
  switch (phase) {
    case 'data':
      return EventType.ContinueExtractingData;
    case 'attachments':
      return EventType.ContinueExtractingAttachments;
    default:
      // Sync units and metadata don't have continuation events
      throw new Error(`Phase ${phase} does not support continuation`);
  }
}

function extractSyncUnits(
  callback: CallbackEvent
): Array<{ id: string; name: string; description?: string }> {
  const eventData = callback.event_data as any;
  if (!eventData?.external_sync_units) return [];

  return eventData.external_sync_units.map((su: any) => ({
    id: su.id,
    name: su.name,
    description: su.description,
  }));
}

// ──────────────────────────────────────────────
// Logging helpers
// ──────────────────────────────────────────────

/**
 * Mutate `target` in-place so that it mirrors `source`.
 * This is used to patch the cached IDM module with override values
 * so the connector's `spawn()` picks up the merged IDM.
 */
function applyIdmOverrides(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  // Remove keys in target that are not in source
  for (const key of Object.keys(target)) {
    if (!(key in source)) {
      delete target[key];
    }
  }
  // Copy/merge keys from source into target
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      applyIdmOverrides(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      target[key] = sourceVal;
    }
  }
}

function log(message: string): void {
  const timestamp = new Date().toISOString().substring(11, 23);
  process.stdout.write(`  [${timestamp}] ${message}\n`);
}

function logError(message: string): void {
  const timestamp = new Date().toISOString().substring(11, 23);
  process.stderr.write(`  [${timestamp}] ERROR: ${message}\n`);
}

function logWarn(message: string): void {
  const timestamp = new Date().toISOString().substring(11, 23);
  process.stderr.write(`  [${timestamp}] WARN: ${message}\n`);
}
