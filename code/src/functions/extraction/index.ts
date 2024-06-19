import { AirdropEvent, DemoExtractor } from '@devrev/ts-adaas';

const run = async (events: AirdropEvent[]) => {
  for (const event of events) {
    console.log('Event in airdrop-template-snapin: ' + JSON.stringify(event));
    const demoExtractor = new DemoExtractor();
    await demoExtractor.run(event);
  }
};

export default run;
