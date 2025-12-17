import { AirdropEvent, spawn } from '@devrev/ts-adaas';

import initialDomainMapping from '../external-system/initial_domain_mapping.json';

// TODO: If needed, you can replace this with state interface that will keep
// track of the loading progress.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LoaderState {}

// TODO: Replace with your initial state that will be passed to the worker.
// This state will be used as a starting point for the loading process.
export const initialLoaderState: LoaderState = {};

const run = async (events: AirdropEvent[]) => {
  for (const event of events) {
    await spawn<LoaderState>({
      event,
      initialState: initialLoaderState,
      initialDomainMapping,
      baseWorkerPath: __dirname,

      // TODO: If needed you can pass additional options to the spawn function.
      // For example timeout of the lambda, batch size, etc.
      // options: {
      //   timeout: 1 * 1000 * 60, // 1 minute
      // },
    });
  }
};

export default run;
