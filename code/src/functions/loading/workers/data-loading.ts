import { processTask, LoaderEventType } from '@devrev/ts-adaas';

processTask({
  task: async ({ adapter }) => {
    await adapter.emit(LoaderEventType.DataLoadingDone, {
      reports: adapter.reports,
      processed_files: adapter.processedFiles,
    });
  },
  onTimeout: async ({ adapter }) => {
    await adapter.postState();
    await adapter.emit(LoaderEventType.DataLoadingProgress, {
      reports: adapter.reports,
      processed_files: adapter.processedFiles,
    });
  },
});
