import {
  axios,
  ExternalSystemAttachmentStreamingParams,
  ExternalSystemAttachmentStreamingResponse,
  ExtractorEventType,
  processTask,
  serializeAxiosError,
} from '@devrev/ts-adaas';

const getAttachmentStream = async ({
  item,
  event,
}: ExternalSystemAttachmentStreamingParams): Promise<ExternalSystemAttachmentStreamingResponse> => {
  const { id, url, inline } = item;

  try {
    const fileStreamResponse = await axios.get(url, {
      responseType: 'stream',
    });

    return { httpStream: fileStreamResponse };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error while fetching attachment from URL.', serializeAxiosError(error));
    } else {
      console.error('Error while fetching attachment from URL.', error);
    }
    return {
      error: {
        message: 'Error while fetching attachment ' + id + ' from URL.',
      },
    };
  }
};

processTask({
  task: async ({ adapter }) => {
    const { error, delay } = await adapter.streamAttachments({
      stream: getAttachmentStream,
    });

    if (delay) {
      await adapter.emit(ExtractorEventType.ExtractionAttachmentsDelay, {
        delay,
      });
    } else if (error) {
      await adapter.emit(ExtractorEventType.ExtractionAttachmentsError, {
        error,
      });
    } else {
      await adapter.emit(ExtractorEventType.ExtractionAttachmentsDone);
    }
  },
  onTimeout: async ({ adapter }) => {
    await adapter.postState();
    await adapter.emit(ExtractorEventType.ExtractionAttachmentsProgress, {
      progress: 50,
    });
  },
});
