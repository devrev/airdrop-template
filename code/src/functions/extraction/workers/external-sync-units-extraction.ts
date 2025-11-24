import { ExternalSyncUnit, ExtractorEventType, processTask } from '@devrev/ts-adaas';

import { normalizeTodoList } from '../../external-system/data-normalization';
import { HttpClient } from '../../external-system/http-client';

processTask({
  task: async ({ adapter }) => {
    // TODO: Replace with HTTP client that will be used to make API calls
    // to the external system.
    const httpClient = new HttpClient(adapter.event);

    // TODO: Replace with actual API call to fetch external sync units.
    const todoLists = await httpClient.getTodoLists();

    // TODO: Normalize the data received from the API call to match the
    // ExternalSyncUnit interface. Modify the normalization function to suit
    // your needs.
    const externalSyncUnits: ExternalSyncUnit[] = todoLists.map((todoList) => normalizeTodoList(todoList));

    await adapter.emit(ExtractorEventType.ExtractionExternalSyncUnitsDone, {
      external_sync_units: externalSyncUnits,
    });
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.ExtractionExternalSyncUnitsError, {
      error: {
        message: 'Failed to extract external sync units. Lambda timeout.',
      },
    });
  },
});
