import { ExtractorEventType, processTask } from '@devrev/ts-adaas';

import { normalizeAttachment, normalizeTodo, normalizeUser } from '../../external-system/data-normalization';
import { HttpClient } from '../../external-system/http-client';
import { ExtractorState } from '../index';
import { ExternalTodo, ExternalUser, ExternalAttachment } from '../../external-system/types';

// TODO: Replace with actual repos that will be used to store the
// data extracted from the external system. Also replace and modify
// the normalization functions which are used to normalize the data.
const repos = [
  {
    itemType: 'todos',
    normalize: (item: object) => normalizeTodo(item as ExternalTodo),
  },
  {
    itemType: 'users',
    normalize: (item: object) => normalizeUser(item as ExternalUser),
  },
  {
    itemType: 'attachments',
    normalize: (item: object) => normalizeAttachment(item as ExternalAttachment),
  },
];

// TODO: Replace with the item types you want to extract from the external system.
// The extractFunction receives the time window (extract_from, extract_to) resolved
// by the SDK from the CPv2 extraction_start_time / extraction_end_time fields.
interface ItemTypeToExtract {
  name: 'todos' | 'users' | 'attachments';
  extractFunction: (client: HttpClient, modifiedAfter: string, modifiedBefore: string) => Promise<object[]>;
  /**
   * When true, the CPv2 time window is ignored and all items are always
   * extracted. Use this for reference/identity data (e.g. users) that other
   * item types depend on — extracting only a recent window would leave
   * references to older records unresolvable.
   */
  alwaysFullExtract?: boolean;
}

// Sentinel timestamps used when alwaysFullExtract is true.
const EPOCH = '1970-01-01T00:00:00.000Z';
const FAR_FUTURE = '9999-12-31T23:59:59.999Z';

const itemTypesToExtract: ItemTypeToExtract[] = [
  {
    name: 'todos',
    extractFunction: (client, modifiedAfter, modifiedBefore) => client.getTodos(modifiedAfter, modifiedBefore),
  },
  {
    // Users are always fully extracted regardless of the CPv2 time window.
    // They are identity/reference data: todos reference users via creator and
    // owner fields. If only recently-modified users were extracted, older users
    // would be missing and those references could not be resolved.
    name: 'users',
    extractFunction: (client, modifiedAfter, modifiedBefore) => client.getUsers(modifiedAfter, modifiedBefore),
    alwaysFullExtract: true,
  },
  {
    name: 'attachments',
    extractFunction: (client, modifiedAfter, modifiedBefore) => client.getAttachments(modifiedAfter, modifiedBefore),
  },
];

processTask<ExtractorState>({
  task: async ({ adapter }) => {
    adapter.initializeRepos(repos);

    // TODO: Replace with the HTTP client that will be used to make API calls
    // to the external system.
    const httpClient = new HttpClient(adapter.event);

    // CPv2: The SDK always resolves extract_from and extract_to from the
    // platform's extraction_start_time / extraction_end_time to concrete ISO
    // 8601 timestamps before calling the connector.
    //
    // For a full initial sync extract_from is the UNIX epoch
    // ("1970-01-01T00:00:00.000Z") and extract_to is the current time, so
    // every item passes the filter.  For an ongoing / time-scoped sync the
    // platform sets a narrower window covering only data that changed inside
    // that range.
    //
    // The connector never needs to inspect or branch on the sync mode — it
    // always uses the provided window to filter data from the external system.
    const { extract_from, extract_to } = adapter.event.payload.event_context;

    // TODO: Replace with your implementation to extract data from the external
    // system. This example iterates over item types, respects the extraction
    // scope (selective extraction) and the CPv2 time window, pushes items to
    // the repo, and saves progress to state.
    for (const itemTypeToExtract of itemTypesToExtract) {
      // If the worker is about to time out, exit early so that `onTimeout`
      // can run and emit progress back to the platform.
      if (adapter.isTimeout) {
        return;
      }

      // Selective extraction: skip item types that are not in scope according
      // to the user's sync recipe configuration. The platform communicates
      // this through the extraction scope attached to the adapter state.
      // Defaults to true if the item type is not listed in the scope.
      if (!adapter.shouldExtract(itemTypeToExtract.name)) {
        adapter.state[itemTypeToExtract.name].completed = true;
        continue;
      }

      const items = await itemTypeToExtract.extractFunction(
        httpClient,
        // Both timestamps are always present ISO strings — no null check needed.
        // Items with alwaysFullExtract bypass the CPv2 window entirely.
        itemTypeToExtract.alwaysFullExtract ? EPOCH : extract_from as string,
        itemTypeToExtract.alwaysFullExtract ? FAR_FUTURE : extract_to as string
      );
      await adapter.getRepo(itemTypeToExtract.name)?.push(items);
      adapter.state[itemTypeToExtract.name].completed = true;
    }

    await adapter.emit(ExtractorEventType.DataExtractionDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.DataExtractionProgress);
  },
});
