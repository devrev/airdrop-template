import {
  axios,
  axiosClient,
  ExternalSystemAttachmentStreamingParams,
  ExternalSystemAttachmentStreamingResponse,
  ExtractorEventType,
  processTask,
} from '@devrev/ts-adaas';

// TODO: Replace with function for fetching attachment streams from the
// external system. This function should return either a stream of the
// attachment data, a delay or an error.
async function getFileStream({
  item,
}: ExternalSystemAttachmentStreamingParams): Promise<ExternalSystemAttachmentStreamingResponse> {
  const { id, url } = item;

  try {
    const fileStreamResponse = await axiosClient.get(url, {
      responseType: 'stream',
      headers: {
        'Accept-Encoding': 'identity',
        timeout: 30000,
      },
    });

    return { httpStream: fileStreamResponse };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error?.response?.status === 429) {
        const retryAfter = error.response?.headers['retry-after'];
        return { delay: retryAfter };
      } else {
        return {
          error: {
            message: `Error while fetching attachment ${id} from URL. Error code: ${error.response?.status}. Error message: ${error.response?.data.message}.`,
          },
        };
      }
    }

    return {
      error: {
        message: `Unknown error while fetching attachment ${id} from URL. Error: ${error}.`,
      },
    };
  }
}

processTask({
  task: async ({ adapter }) => {
    try {
      const response = await adapter.streamAttachments({
        stream: getFileStream,

        // TODO: If needed you can specify how many attachments to stream at
        // once. Minimum is 1 and maximum is 50.
        // batchSize: 10,
      });

      if (response?.delay) {
        await adapter.emit(ExtractorEventType.ExtractionAttachmentsDelay, {
          delay: response.delay,
        });
      } else if (response?.error) {
        await adapter.emit(ExtractorEventType.ExtractionAttachmentsError, {
          error: response.error,
        });
      } else {
        await adapter.emit(ExtractorEventType.ExtractionAttachmentsDone);
      }
    } catch (error) {
      console.error('An error occured while processing a task.', error);
    }
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.ExtractionAttachmentsProgress);
  },
});
