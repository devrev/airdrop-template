import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { MockDevRevServer } from './mock-devrev-server';
import { ExtractionPhase, runExtraction } from './orchestrator';
import { LocalFixture } from './event-factory';
import { validateAndReport } from './validator';

const DEFAULT_PORT = 9999;
const DEFAULT_OUTPUT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'local-output'
);

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage('Usage: $0 --fixture <path> [options]')
    .option('fixture', {
      alias: 'f',
      type: 'string',
      description: 'Path to fixture JSON file (relative to code/ or absolute)',
      demandOption: true,
    })
    .option('clean', {
      type: 'boolean',
      default: false,
      description: 'Wipe local-output/ before starting (fresh state)',
    })
    .option('skip-attachments', {
      type: 'boolean',
      default: false,
      description: 'Skip the attachment extraction phase',
    })
    .option('phases', {
      type: 'string',
      description:
        'Comma-separated list of phases to run (sync-units,metadata,data,attachments)',
    })
    .option('port', {
      type: 'number',
      default: DEFAULT_PORT,
      description: 'Port for the mock DevRev server',
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      default: DEFAULT_OUTPUT_DIR,
      description: 'Output directory path',
    })
    .help()
    .alias('help', 'h')
    .example(
      '$0 --fixture src/fixtures/local-extraction.json',
      'Run full extraction with default mock-api'
    )
    .example(
      '$0 --fixture src/fixtures/local-extraction.json --clean --skip-attachments',
      'Clean run, skip attachments'
    )
    .example(
      '$0 --fixture src/fixtures/local-extraction.json --phases data',
      'Only run data extraction phase'
    )
    .parse();

  // ──────────────────────────────────────────────
  // Resolve and validate fixture path
  // ──────────────────────────────────────────────

  let fixturePath = argv.fixture;
  if (!path.isAbsolute(fixturePath)) {
    fixturePath = path.resolve(process.cwd(), fixturePath);
  }

  if (!fs.existsSync(fixturePath)) {
    console.error(`Fixture file not found: ${fixturePath}`);
    process.exit(1);
  }

  let fixture: LocalFixture;
  try {
    const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');
    fixture = JSON.parse(fixtureContent);
  } catch (error) {
    console.error(
      `Failed to parse fixture file: ${error instanceof Error ? error.message : error}`
    );
    process.exit(1);
  }

  if (!fixture.connection_data) {
    console.error('Fixture must contain a "connection_data" field');
    process.exit(1);
  }

  // ──────────────────────────────────────────────
  // Parse phases
  // ──────────────────────────────────────────────

  let phases: ExtractionPhase[] | undefined;
  if (argv.phases) {
    const validPhases = new Set([
      'sync-units',
      'metadata',
      'data',
      'attachments',
    ]);
    const parsed = argv.phases.split(',').map((p) => p.trim());
    for (const p of parsed) {
      if (!validPhases.has(p)) {
        console.error(
          `Invalid phase: "${p}". Valid phases: ${Array.from(validPhases).join(', ')}`
        );
        process.exit(1);
      }
    }
    phases = parsed as ExtractionPhase[];
  }

  // ──────────────────────────────────────────────
  // Clean output directory if requested
  // ──────────────────────────────────────────────

  const outputDir = argv.output;

  if (argv.clean && fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    console.log(`Cleaned output directory: ${outputDir}`);
  }

  // ──────────────────────────────────────────────
  // Start mock server
  // ──────────────────────────────────────────────

  const server = new MockDevRevServer({
    port: argv.port,
    outputDir,
  });

  try {
    await server.start();
    console.log(`Mock DevRev server started on ${server.baseUrl}`);
    console.log(`Output directory: ${outputDir}`);
    console.log('');

    // ──────────────────────────────────────────────
    // Run extraction
    // ──────────────────────────────────────────────

    const result = await runExtraction({
      fixture,
      server,
      phases,
      skipAttachments: argv['skip-attachments'],
    });

    // ──────────────────────────────────────────────
    // Validate and report
    // ──────────────────────────────────────────────

    await validateAndReport(server, result);

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error(
      'Fatal error:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    await server.stop();
  }
}

main();
