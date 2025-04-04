import { ExtractorEventType, processTask } from '@devrev/ts-adaas';

import staticExternalDomainMetadata from '../../external-system/external_domain_metadata.json';

const repos = [
  {
    itemType: 'external_domain_metadata',
  },
];

processTask({
  task: async ({ adapter }) => {
    adapter.initializeRepos(repos);

    // TODO: If needed, add handling for dynamic external domain metadata
    // extraction here. For example, you might want to call an external system API to
    // get custom fields and their values and append them to the static
    // external domain metadata.
    const externalDomainMetadata = {
      ...staticExternalDomainMetadata,
    };

    await adapter.getRepo('external_domain_metadata')?.push([externalDomainMetadata]);
    await adapter.emit(ExtractorEventType.ExtractionMetadataDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.ExtractionMetadataError, {
      error: { message: 'Failed to extract metadata. Lambda timeout.' },
    });
  },
});
