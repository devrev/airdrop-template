import { AirdropEvent, installInitialDomainMapping } from '@devrev/ts-adaas';

import initialDomainMapping from '../extraction/initial_domain_mapping.json';

const run = async (events: AirdropEvent[]) => {
  for (const event of events) {
    try {
      await installInitialDomainMapping(event, initialDomainMapping);
    } catch (error) {
      console.error('Failed to install initial domain mappings', error);
      throw error;
    }
  }
};

export default run;
