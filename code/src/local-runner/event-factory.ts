import crypto from 'crypto';
import { AirdropEvent, EventType } from '@devrev/ts-adaas';

import initialDomainMapping from '../functions/external-system/initial_domain_mapping.json';

/**
 * Fixture file format. Users provide this to configure the local extraction run.
 */
export interface LocalFixture {
  /** Connection data for the external system */
  connection_data: {
    org_id: string;
    org_name: string;
    key: string;
    key_type: string;
  };
  /** Hardcoded external sync unit ID (optional - auto-detected from ESU extraction if not set) */
  external_sync_unit_id?: string;
  /** Additional options */
  options?: {
    /** Base URL for the external API (e.g. http://localhost:3001 for mock-api) */
    external_api_base_url?: string;
  };
  /**
   * Deep-merge overrides applied on top of the IDM from initial_domain_mapping.json.
   * Allows testing different mapping configurations without modifying the source file.
   */
  mapping_overrides?: Record<string, unknown>;
}

/**
 * Deep merge two objects. Source values override target values.
 * Arrays are replaced, not concatenated.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Build the effective Initial Domain Mapping by merging fixture overrides
 * on top of the static IDM from initial_domain_mapping.json.
 */
export function buildEffectiveIDM(
  fixture: LocalFixture
): typeof initialDomainMapping {
  if (!fixture.mapping_overrides) {
    return initialDomainMapping;
  }

  return deepMerge(
    initialDomainMapping as unknown as Record<string, unknown>,
    { additional_mappings: fixture.mapping_overrides }
  ) as unknown as typeof initialDomainMapping;
}

/**
 * Derive a snap_in_version_id from the IDM content.
 * This ensures that changing mapping_overrides triggers IDM re-installation,
 * while unchanged runs reuse cached state.
 */
function deriveVersionId(idm: object): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(idm))
    .digest('hex')
    .substring(0, 12);
  return `local-version-${hash}`;
}

export interface CreateEventOptions {
  fixture: LocalFixture;
  eventType: EventType;
  mockServerBaseUrl: string;
  /** Override the external sync unit ID (e.g. after ESU extraction discovers it) */
  externalSyncUnitId?: string;
  /** Carry forward event_data from previous callback (e.g. for continuation events) */
  eventData?: Record<string, unknown>;
  /** Run ID - should stay consistent across all phases of a single run */
  runId?: string;
  /** Request ID - should stay consistent across all phases of a single run */
  requestId?: string;
  /** Mode - 'INITIAL' for extraction, 'LOADING' for loading */
  mode?: 'INITIAL' | 'LOADING';
}

/**
 * Construct a valid AirdropEvent for a given extraction phase.
 * All DevRev backend URLs are pointed at the local mock server.
 */
export function createLocalEvent({
  fixture,
  eventType,
  mockServerBaseUrl,
  externalSyncUnitId,
  eventData,
  runId,
  requestId,
  mode,
}: CreateEventOptions): AirdropEvent {
  const effectiveIDM = buildEffectiveIDM(fixture);
  const versionId = deriveVersionId(effectiveIDM);
  const syncUnitId = externalSyncUnitId || fixture.external_sync_unit_id || 'local-sync-unit';
  const effectiveRunId = runId || crypto.randomUUID();
  const effectiveRequestId = requestId || crypto.randomUUID();
  const effectiveMode = mode || 'INITIAL';

  return {
    context: {
      secrets: {
        service_account_token: 'local-dev-token',
      },
      snap_in_version_id: versionId,
      snap_in_id: 'local-snap-in',
    },
    payload: {
      connection_data: fixture.connection_data,
      event_context: {
        callback_url: `${mockServerBaseUrl}/callback`,
        dev_org: 'local-dev-org',
        dev_oid: 'local-dev-org',
        dev_org_id: 'local-dev-org',
        dev_user: 'local-dev-user',
        dev_user_id: 'local-dev-user',
        dev_uid: 'local-dev-user',
        event_type_adaas: eventType,
        external_sync_unit: syncUnitId,
        external_sync_unit_id: syncUnitId,
        external_sync_unit_name: 'Local Sync Unit',
        external_system: 'local-external-system',
        external_system_id: 'local-external-system',
        external_system_name: 'Local External System',
        external_system_type: 'ADaaS',
        import_slug: 'local_import_slug',
        mode: effectiveMode,
        request_id: effectiveRequestId,
        request_id_adaas: effectiveRequestId,
        run_id: effectiveRunId,
        sequence_version: '1',
        snap_in_slug: 'local_snap_in_slug',
        snap_in_version_id: versionId,
        sync_run: 'local-sync-run',
        sync_run_id: 'local-sync-run',
        sync_tier: 'local',
        sync_unit: {} as any,
        sync_unit_id: syncUnitId,
        uuid: crypto.randomUUID(),
        worker_data_url: `${mockServerBaseUrl}/worker_data_url`,
      },
      event_type: eventType,
      event_data: eventData as any,
    },
    execution_metadata: {
      devrev_endpoint: mockServerBaseUrl,
    },
    input_data: {
      global_values: {},
      event_sources: {},
    },
  };
}
