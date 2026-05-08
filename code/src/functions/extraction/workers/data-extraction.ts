import { ExtractorEventType, processTask } from '@devrev/ts-adaas';

import { normalizeAttachment, normalizeTodo, normalizeUser } from '../../external-system/data-normalization';
import { HttpClient } from '../../external-system/http-client';
import { ExtractorState } from '../index';
import { ExternalTodo, ExternalUser, ExternalAttachment } from '../../external-system/types';

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

interface ItemTypeToExtract {
  name: 'todos' | 'users' | 'attachments';
  extractFunction: (client: HttpClient) => Promise<object[]>;
}

const itemTypesToExtract: ItemTypeToExtract[] = [
  {
    name: 'todos',
    extractFunction: (client: HttpClient) => client.getTodos(),
  },
  {
    name: 'users',
    extractFunction: (client: HttpClient) => client.getUsers(),
  },
  {
    name: 'attachments',
    extractFunction: (client: HttpClient) => client.getAttachments(),
  },
];

processTask<ExtractorState>({
  task: async ({ adapter }) => {
    adapter.initializeRepos(repos);

    // TODO: Replace with the HTTP client that will be used to make API calls
    // to the external system.
    const httpClient = new HttpClient(adapter.event);

    for (const itemTypeToExtract of itemTypesToExtract) {
      if (adapter.isTimeout) {
        return;
      }

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
