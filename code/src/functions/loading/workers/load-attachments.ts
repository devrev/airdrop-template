import {
  ExternalSystemAttachment,
  ExternalSystemItemLoadingParams,
  LoaderEventType,
  processTask,
} from '@devrev/ts-adaas';

import { HttpClient } from '../../external-system/http-client';
import { LoaderState } from '../index';

// TODO: Replace with your create function that will be used to make API calls
// to the external system to create a new attachment. Function must return
// object with http stream or error depending on the response from the external system.
async function createAttachment({ item, mappers, event }: ExternalSystemItemLoadingParams<ExternalSystemAttachment>) {
  // TODO: Replace with your HTTP client that will be used to make API calls
  // to the external system.
  const httpClient = new HttpClient(event);
  const createAttachmentResponse = await httpClient.createAttachment(item);
  return createAttachmentResponse;
}

processTask<LoaderState>({
  task: async ({ adapter }) => {
    const { reports, processed_files } = await adapter.loadAttachments({
      create: createAttachment,
    });

    await adapter.emit(LoaderEventType.AttachmentLoadingDone, {
      reports,
      processed_files,
    });
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(LoaderEventType.AttachmentLoadingProgress, {
      reports: adapter.reports,
      processed_files: adapter.processedFiles,
    });
  },
});
