import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { MockDevRevServer } from './mock-devrev-server';
import { ExtractionPhase, runExtraction, runLoading } from './orchestrator';
import { LocalFixture } from './event-factory';
import { validateAndReport, validateAndReportLoading } from './validator';

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
      description: 'Skip the attachment extraction/loading phases',
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
    .option('with-loading', {
      type: 'boolean',
      default: false,
      description: 'Also run loading phase after extraction',
    })
    .option('loading-only', {
      type: 'boolean',
      default: false,
      description: 'Only run loading (assumes extraction already ran, reuses artifacts from local-output/)',
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
      '$0 --fixture src/fixtures/local-extraction.json --with-loading',
      'Run extraction then loading'
    )
    .example(
      '$0 --fixture src/fixtures/local-extraction.json --loading-only',
      'Run loading on previously extracted data'
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

    const withLoading = argv['with-loading'] || false;
    const loadingOnly = argv['loading-only'] || false;

    // ──────────────────────────────────────────────
    // Run extraction (unless loading-only)
    // ──────────────────────────────────────────────

    let extractionResult;

    if (!loadingOnly) {
      extractionResult = await runExtraction({
        fixture,
        server,
        phases,
        skipAttachments: argv['skip-attachments'],
      });

      await validateAndReport(server, extractionResult);

      if (!extractionResult.success) {
        process.exit(1);
      }
    } else {
      // In loading-only mode, reconstitute artifact metadata from disk
      const reconstituted = server.reconstitueArtifactsFromDisk();
      if (reconstituted === 0) {
        console.error(
          'No artifacts found in local-output/. Run extraction first, or use --with-loading.'
        );
        process.exit(1);
      }
      console.log(`Reconstituted ${reconstituted} artifact(s) from previous extraction run`);
      console.log('');
    }

    // ──────────────────────────────────────────────
    // Run loading (if requested)
    // ──────────────────────────────────────────────

    if (withLoading || loadingOnly) {
      // Determine external sync unit ID from extraction result or fixture
      const externalSyncUnitId =
        (extractionResult?.externalSyncUnits?.[0]?.id) ||
        fixture.external_sync_unit_id;

      console.log('');
      console.log('Starting loading phase...');
      console.log('');

      const loadingResult = await runLoading({
        fixture,
        server,
        skipAttachments: argv['skip-attachments'],
        externalSyncUnitId,
      });

      await validateAndReportLoading(server, loadingResult);

      if (!loadingResult.success) {
        process.exit(1);
      }
    }

    process.exit(0);
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
