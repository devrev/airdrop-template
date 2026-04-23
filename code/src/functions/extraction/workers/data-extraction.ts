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
interface ItemTypeToExtract {
  name: 'todos' | 'users' | 'attachments';
  extractFunction: (client: HttpClient) => Promise<object[]>;
}

const itemTypesToExtract: ItemTypeToExtract[] = [
  {
    name: 'todos',
    extractFunction: (client) => client.getTodos(),
  },
  {
    name: 'users',
    extractFunction: (client) => client.getUsers(),
  },
  {
    name: 'attachments',
    extractFunction: (client) => client.getAttachments(),
  },
];

processTask<ExtractorState>({
  task: async ({ adapter }) => {
    adapter.initializeRepos(repos);

    // TODO: Replace with the HTTP client that will be used to make API calls
    // to the external system.
    const httpClient = new HttpClient(adapter.event);

    // CPv2 note: if you enable TIME_SCOPED_SYNCS in manifest.yaml, read
    // adapter.event.payload.event_context.extract_from / extract_to here and
    // pass them to the external system query layer.

    // TODO: Replace with your implementation to extract data from the external
    // system. This example iterates over item types, respects the extraction
    // scope (selective extraction), pushes items to the repo, and saves
    // progress to state.
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

      const items = await itemTypeToExtract.extractFunction(httpClient);
      await adapter.getRepo(itemTypeToExtract.name)?.push(items);
      adapter.state[itemTypeToExtract.name].completed = true;
    }

    await adapter.emit(ExtractorEventType.DataExtractionDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.DataExtractionProgress);
  },
});
