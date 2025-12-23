import { AirdropEvent, spawn } from '@devrev/ts-adaas';

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

const run = async (events: AirdropEvent[]) => {
  for (const event of events) {
    await spawn<ExtractorState>({
      event,
      initialState: initialExtractorState,
      initialDomainMapping,
      baseWorkerPath: __dirname,

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
