import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { FunctionFactoryType } from './function-factory';
import { testRunner } from './test-runner/test-runner';

(async () => {
  const argv = await yargs(hideBin(process.argv)).options({
    fixturePath: {
      type: 'string',
      require: true,
    },
    functionName: {
      type: 'string',
      require: false,
    },
  }).argv;

  if (!argv.fixturePath) {
    console.error('Please make sure you have fixturePath in your command');
  }

  await testRunner({
    fixturePath: argv.fixturePath,
    functionName: argv.functionName as FunctionFactoryType | undefined,
  });
})();
