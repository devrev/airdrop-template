import { AirdropEvent, createAdapter, DemoExtractor } from '@devrev/ts-adaas';

const run = async (events: AirdropEvent[]) => {
  for (const event of events) {
    const adapter = await createAdapter<object>(event, {});
    const demoExtractor = new DemoExtractor(event, adapter);
    await demoExtractor.run();
  }
};

export default run;
