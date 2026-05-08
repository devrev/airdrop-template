import {
  AirSyncDefaultItemTypes,
  ExternalSyncUnit,
  ExtractorEventType,
  processTask,
} from '@devrev/ts-adaas';

import { normalizeTodoList } from '../../external-system/data-normalization';
import { HttpClient } from '../../external-system/http-client';

processTask({
  task: async ({ adapter }) => {
    adapter.initializeRepos([
      {
        itemType: AirSyncDefaultItemTypes.EXTERNAL_SYNC_UNITS,
        overridenOptions: {
          batchSize: 25000,
          skipConfirmation: true,
        },
      },
    ]);

    const httpClient = new HttpClient(adapter.event);

    const todoLists = await httpClient.getTodoLists();

    const externalSyncUnits: ExternalSyncUnit[] = todoLists.map((todoList) => normalizeTodoList(todoList));

    await adapter
      .getRepo(AirSyncDefaultItemTypes.EXTERNAL_SYNC_UNITS)
      ?.push(externalSyncUnits);

    await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionError, {
      error: {
        message: 'Failed to extract external sync units. Lambda timeout.',
      },
    });
  },
});
