import { AirdropEvent, DemoExtractor } from '@devrev/ts-adaas';

const run = async (events: AirdropEvent[]) => {
  for (const event of events) {
    console.log('Event: ' + JSON.stringify(event));
    const extractor = new DemoExtractor();
    await extractor.run(event);
  }
};

export default run;
