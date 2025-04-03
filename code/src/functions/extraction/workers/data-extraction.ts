import { ExtractorEventType, processTask } from '@devrev/ts-adaas';

import { normalizeAttachment, normalizeTodo, normalizeUser } from '../../external-system/data-normalization';
import { HttpClient } from '../../external-system/http-client';
import { ExtractorState } from '../index';

// TODO: Replace repos with your actual repos that will be used to store the
// data extracted from the external system. For example, you might want to
// create repos for todos, users, and attachments. Also replace normalization
// functions with your actual normalization functions that will be used to
// normalize the data received from the external system.
const repos = [
  {
    itemType: 'todos',
    normalize: normalizeTodo,
  },
  {
    itemType: 'users',
    normalize: normalizeUser,
  },
  {
    itemType: 'attachments',
    normalize: normalizeAttachment,
  },
];

// TODO: Replace with your item types to extract and their corresponding extract
// functions. Later use this data to easier iterate over the item types and
// extract the data from the external system.
interface ItemTypeToExtract {
  name: 'todos' | 'users' | 'attachments';
  extractFunction: (client: HttpClient) => Promise<any[]>;
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

    // TODO: Replace with your HTTP client that will be used to make API calls
    // to the external system.
    const httpClient = new HttpClient(adapter.event);

    // TODO: Replace with your implementation to extract data from the external
    // system. This is just an example how you can iterate over the item types,
    // extract them, push them to the repo, and save the state.
    for (const itemTypeToExtract of itemTypesToExtract) {
      const items = await itemTypeToExtract.extractFunction(httpClient);
      await adapter.getRepo(itemTypeToExtract.name)?.push(items);
      adapter.state[itemTypeToExtract.name].completed = true;
    }

    await adapter.emit(ExtractorEventType.ExtractionDataDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.ExtractionDataProgress);
  },
});
