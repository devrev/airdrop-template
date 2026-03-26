import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { FunctionFactoryType } from './function-factory';
import { localRunner } from './local-runner/local-runner';

(async () => {
  const argv = await yargs(hideBin(process.argv)).options({
    fixturePath: {
      type: 'string',
      demandOption: true,
      describe: 'Name of the fixture folder inside code/fixtures/ (e.g. start_extracting_data)',
    },
    functionName: {
      type: 'string',
      describe:
        'Function to run (e.g. "extraction" or "loading"). ' + 'Can also be set via "function_name" in event.json.',
    },
    local: {
      type: 'boolean',
      default: false,
      describe:
        'Run in local development mode — log messages are printed as plain ' + 'text instead of full JSON objects.',
    },
    printState: {
      type: 'boolean',
      default: false,
      describe: 'Print the adapter state every time the function updates it ' + '(posts to worker_data_url.update).',
    },
  }).argv;

  // The SDK's spawn() checks for a "local" positional argument in process.argv
  // to enable plain-text logging. We splice it at index 2 so yargs inside
  // spawn() sees it as a positional, not as a value of another flag.
  if (argv.local && process.argv[2] !== 'local') {
    process.argv.splice(2, 0, 'local');
  }

  await localRunner({
    fixturePath: argv.fixturePath,
    functionName: argv.functionName as FunctionFactoryType | undefined,
    printState: argv.printState,
  });
})();
