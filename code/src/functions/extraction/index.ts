import { AirdropEvent, EventType, spawn } from '@devrev/ts-adaas';

import initialDomainMapping from '../external-system/initial_domain_mapping.json';

// TODO: Replace with your state interface that will keep track of the
// extraction progress. For example, the page number, the number of items
// processed, if the extraction is completed, etc.
export interface ExtractorState {
  todos: { completed: boolean };
  users: { completed: boolean };
  attachments: { completed: boolean };
}

// TODO: Replace with your initial state that will be passed to the worker.
// This state will be used as a starting point for the extraction process.
export const initialExtractorState: ExtractorState = {
  todos: { completed: false },
  users: { completed: false },
  attachments: { completed: false },
};

function getWorkerPerExtractionPhase(event: AirdropEvent) {
  let path;
  switch (event.payload.event_type) {
    case EventType.ExtractionExternalSyncUnitsStart:
      path = __dirname + '/workers/external-sync-units-extraction';
      break;
    case EventType.ExtractionMetadataStart:
      path = __dirname + '/workers/metadata-extraction';
      break;
    case EventType.ExtractionDataStart:
    case EventType.ExtractionDataContinue:
      path = __dirname + '/workers/data-extraction';
      break;
    case EventType.ExtractionAttachmentsStart:
    case EventType.ExtractionAttachmentsContinue:
      path = __dirname + '/workers/attachments-extraction';
      break;
  }
  return path;
}

const run = async (events: AirdropEvent[]) => {
  for (const event of events) {
    const file = getWorkerPerExtractionPhase(event);
    await spawn<ExtractorState>({
      event,
      initialState: initialExtractorState,
      workerPath: file,
      initialDomainMapping,

      // TODO: If needed you can pass additional options to the spawn function.
      // For example timeout of the lambda, batch size, etc.
      // options: {
      //   timeout: 1 * 1000 * 60, // 1 minute
      //   batchSize: 50, // 50 items per batch
      // },
    });
  }
};

export default run;
