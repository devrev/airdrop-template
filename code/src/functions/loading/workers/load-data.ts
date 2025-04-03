import {
  ExternalSystemItem,
  ExternalSystemItemLoadingParams,
  ExternalSystemItemLoadingResponse,
  LoaderEventType,
  processTask,
} from '@devrev/ts-adaas';

import { denormalizeTodo } from '../../external-system/data-denormalization';
import { HttpClient } from '../../external-system/http-client';

// TODO: Replace with your create function that will be used to make API calls
// to the external system to create a new item. Function must return object with
// id, error or delay depending on the response from the external system.
async function createTodo({
  item,
  mappers,
  event,
}: ExternalSystemItemLoadingParams<ExternalSystemItem>): Promise<ExternalSystemItemLoadingResponse> {
  // TODO: Replace with your HTTP client that will be used to make API calls
  // to the external system.
  const httpClient = new HttpClient(event);
  const todo = denormalizeTodo(item);

  const createTodoResponse = await httpClient.createTodo(todo);
  return createTodoResponse;
}

// TODO: Replace with your update function that will be used to make API calls
// to the external system to update an existing item. Function must return
// object with id, error or delay depending on the response from the external
// system.
async function updateTodo({
  item,
  mappers,
  event,
}: ExternalSystemItemLoadingParams<ExternalSystemItem>): Promise<ExternalSystemItemLoadingResponse> {
  // TODO: Replace with your HTTP client that will be used to make API calls
  // to the external system.
  const httpClient = new HttpClient(event);
  const todo = denormalizeTodo(item);

  const updateTodoResponse = await httpClient.createTodo(todo);
  return updateTodoResponse;
}

processTask({
  task: async ({ adapter }) => {
    const { reports, processed_files } = await adapter.loadItemTypes({
      itemTypesToLoad: [
        {
          itemType: 'todos',
          create: createTodo,
          update: updateTodo,
        },
      ],
    });

    await adapter.emit(LoaderEventType.DataLoadingDone, {
      reports,
      processed_files,
    });
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(LoaderEventType.DataLoadingProgress, {
      reports: adapter.reports,
      processed_files: adapter.processedFiles,
    });
  },
});
