import * as dotenv from 'dotenv';
import * as path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { testRunner } from '@devrev/ts-adaas';

import { functionFactory, FunctionFactoryType } from './function-factory';

(async () => {
  dotenv.config();

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
    functionFactory,
    fixturesBaseDir: path.resolve(__dirname, '../fixtures'),
  });
})();
