import fs from 'fs';
import path from 'path';

import { MockDevRevServer } from './mock-devrev-server';
import { OrchestratorResult } from './orchestrator';

export interface ItemTypeReport {
  itemType: string;
  fileCount: number;
  recordCount: number;
  artifactFiles: string[];
  mergedFile: string;
  sampleIds: string[];
  issues: string[];
}

export interface ValidationReport {
  timestamp: string;
  durationMs: number;
  phasesCompleted: string[];
  phasesFailed: string[];
  externalSyncUnits: Array<{ id: string; name: string; description?: string }>;
  itemTypes: Record<string, ItemTypeReport>;
  validation: {
    duplicateIds: Array<{ itemType: string; id: string; count: number }>;
    emptyFiles: string[];
    totalRecords: number;
    totalFiles: number;
  };
}

/**
 * Validates extraction output, writes merged data files, and generates a report.
 */
export async function validateAndReport(
  server: MockDevRevServer,
  orchestratorResult: OrchestratorResult
): Promise<ValidationReport> {
  const outputDir = server.getOutputDir();
  const dataDir = server.getDataDir();
  const artifactsDir = server.getArtifactsDir();

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Discover all item types from artifacts (excluding binary attachment artifacts)
  const allArtifacts = server.getArtifactMetadata();
  const dataArtifacts = allArtifacts.filter((a) => !a.isBinaryAttachment);
  const binaryArtifacts = allArtifacts.filter((a) => a.isBinaryAttachment);
  const itemTypeSet = new Set(dataArtifacts.map((a) => a.itemType));
  const itemTypes: Record<string, ItemTypeReport> = {};
  const allDuplicates: Array<{ itemType: string; id: string; count: number }> = [];
  const emptyFiles: string[] = [];
  let totalRecords = 0;
  let totalFiles = 0;

  for (const itemType of itemTypeSet) {
    const artifacts = server.getArtifactsByItemType(itemType);
    const records = server.readArtifactRecords(itemType);
    const artifactRelPaths = artifacts.map((a) =>
      path.relative(outputDir, a.filePath)
    );

    totalFiles += artifacts.length;
    totalRecords += records.length;

    // Check for empty files
    for (const artifact of artifacts) {
      if (!fs.existsSync(artifact.filePath)) {
        emptyFiles.push(path.relative(outputDir, artifact.filePath));
        continue;
      }
      const content = fs.readFileSync(artifact.filePath, 'utf-8').trim();
      if (content.length === 0) {
        emptyFiles.push(path.relative(outputDir, artifact.filePath));
      }
    }

    // Check for duplicate IDs
    const idCounts = new Map<string, number>();
    for (const record of records) {
      const id = extractId(record);
      if (id) {
        idCounts.set(id, (idCounts.get(id) || 0) + 1);
      }
    }
    for (const [id, count] of idCounts) {
      if (count > 1) {
        allDuplicates.push({ itemType, id, count });
      }
    }

    // Extract sample IDs for the report
    const sampleIds = records.slice(0, 10).map((r) => {
      const id = extractId(r);
      const label = extractLabel(r);
      return label ? `${id} (${label})` : id || '(no id)';
    });

    // Write merged data file
    const mergedFileName = `${itemType}.json`;
    const mergedFilePath = path.join(dataDir, mergedFileName);
    fs.writeFileSync(mergedFilePath, JSON.stringify(records, null, 2), 'utf-8');

    itemTypes[itemType] = {
      itemType,
      fileCount: artifacts.length,
      recordCount: records.length,
      artifactFiles: artifactRelPaths,
      mergedFile: `data/${mergedFileName}`,
      sampleIds,
      issues: [],
    };

    // Add issues
    if (records.length === 0) {
      itemTypes[itemType].issues.push('No records extracted');
    }
    const dupsForType = allDuplicates.filter((d) => d.itemType === itemType);
    if (dupsForType.length > 0) {
      itemTypes[itemType].issues.push(
        `${dupsForType.length} duplicate ID(s)`
      );
    }
  }

  // Also save external sync units to data directory
  if (orchestratorResult.externalSyncUnits.length > 0) {
    const esuPath = path.join(dataDir, 'external_sync_units.json');
    fs.writeFileSync(
      esuPath,
      JSON.stringify(orchestratorResult.externalSyncUnits, null, 2),
      'utf-8'
    );
  }

  const completedPhases = orchestratorResult.phases
    .filter((p) => !p.error)
    .map((p) => p.phase);
  const failedPhases = orchestratorResult.phases
    .filter((p) => p.error)
    .map((p) => p.phase);

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    durationMs: orchestratorResult.totalDurationMs,
    phasesCompleted: completedPhases,
    phasesFailed: failedPhases,
    externalSyncUnits: orchestratorResult.externalSyncUnits,
    itemTypes,
    validation: {
      duplicateIds: allDuplicates,
      emptyFiles,
      totalRecords,
      totalFiles,
    },
  };

  // Write report.json
  const reportPath = path.join(outputDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  // Print report to console
  printReport(report, outputDir);

  return report;
}

/**
 * Extract an ID from a record (works for NormalizedItem, ExternalSyncUnit, ssor_attachment, etc.)
 */
function extractId(record: any): string | undefined {
  if (record.id !== undefined) {
    // ssor_attachment has id: { devrev: "...", external: "..." }
    if (typeof record.id === 'object' && record.id !== null) {
      return record.id.external || record.id.devrev || JSON.stringify(record.id);
    }
    return String(record.id);
  }
  if (record.data?.id !== undefined) return String(record.data.id);
  return undefined;
}

/**
 * Extract a human-readable label from a record.
 */
function extractLabel(record: any): string | undefined {
  // NormalizedItem has data.title, data.name, etc.
  if (record.data?.title) return truncate(record.data.title, 40);
  if (record.data?.name) return truncate(record.data.name, 40);
  if (record.name) return truncate(record.name, 40);
  if (record.title) return truncate(record.title, 40);
  if (record.data?.display_name) return truncate(record.data.display_name, 40);
  return undefined;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

function printReport(report: ValidationReport, outputDir: string): void {
  const divider = '='.repeat(60);
  const thinDivider = '-'.repeat(60);

  console.log('');
  console.log(divider);
  console.log('  LOCAL EXTRACTION REPORT');
  console.log(divider);
  console.log('');

  // Status
  const totalPhases =
    report.phasesCompleted.length + report.phasesFailed.length;
  const statusIcon = report.phasesFailed.length === 0 ? 'OK' : 'FAILED';
  console.log(
    `  Status: ${statusIcon} (${report.phasesCompleted.length}/${totalPhases} phases completed)`
  );
  console.log(
    `  Duration: ${(report.durationMs / 1000).toFixed(1)}s`
  );

  if (report.phasesFailed.length > 0) {
    console.log(`  Failed: ${report.phasesFailed.join(', ')}`);
  }

  // External Sync Units
  if (report.externalSyncUnits.length > 0) {
    console.log('');
    console.log('  External Sync Units:');
    for (const su of report.externalSyncUnits) {
      console.log(`    - "${su.name}" (id: ${su.id})`);
    }
  }

  // Extracted Data table
  const itemTypeEntries = Object.values(report.itemTypes);
  if (itemTypeEntries.length > 0) {
    console.log('');
    console.log('  Extracted Data:');
    console.log('');

    // Simple table
    const colWidths = {
      type: Math.max(
        12,
        ...itemTypeEntries.map((e) => e.itemType.length + 2)
      ),
      files: 7,
      count: 8,
      issues: 20,
    };

    const header = `  ${'Item Type'.padEnd(colWidths.type)} ${'Files'.padStart(colWidths.files)} ${'Count'.padStart(colWidths.count)}  Issues`;
    console.log(header);
    console.log(`  ${thinDivider}`);

    for (const entry of itemTypeEntries) {
      const issues =
        entry.issues.length === 0 ? 'none' : entry.issues.join(', ');
      console.log(
        `  ${entry.itemType.padEnd(colWidths.type)} ${String(entry.fileCount).padStart(colWidths.files)} ${String(entry.recordCount).padStart(colWidths.count)}  ${issues}`
      );
    }

    console.log(`  ${thinDivider}`);
    console.log(
      `  ${'TOTAL'.padEnd(colWidths.type)} ${String(report.validation.totalFiles).padStart(colWidths.files)} ${String(report.validation.totalRecords).padStart(colWidths.count)}`
    );

    // Sample records
    console.log('');
    for (const entry of itemTypeEntries) {
      if (entry.sampleIds.length > 0 && entry.itemType !== 'external_domain_metadata') {
        console.log(`  ${entry.itemType} (sample records):`);
        for (const sample of entry.sampleIds.slice(0, 5)) {
          console.log(`    - ${sample}`);
        }
        if (entry.recordCount > 5) {
          console.log(
            `    ... and ${entry.recordCount - 5} more (see ${entry.mergedFile})`
          );
        }
        console.log('');
      }
    }
  }

  // Validation warnings
  if (
    report.validation.duplicateIds.length > 0 ||
    report.validation.emptyFiles.length > 0
  ) {
    console.log('  Validation Warnings:');
    if (report.validation.duplicateIds.length > 0) {
      console.log(
        `    - ${report.validation.duplicateIds.length} duplicate ID(s) found`
      );
      for (const dup of report.validation.duplicateIds.slice(0, 5)) {
        console.log(
          `      ${dup.itemType}: id="${dup.id}" (${dup.count} occurrences)`
        );
      }
    }
    if (report.validation.emptyFiles.length > 0) {
      console.log(
        `    - ${report.validation.emptyFiles.length} empty artifact file(s)`
      );
      for (const f of report.validation.emptyFiles) {
        console.log(`      ${f}`);
      }
    }
    console.log('');
  }

  // Output paths
  console.log('  Output:');
  console.log(`    State:          ${outputDir}/state.json`);
  console.log(`    Installed IDM:  ${outputDir}/installed_idm.json`);
  console.log(`    Artifacts:      ${outputDir}/artifacts/`);
  console.log(`    Data:           ${outputDir}/data/`);
  console.log(`    Report:         ${outputDir}/report.json`);
  console.log('');
  console.log(divider);
  console.log('');
}
