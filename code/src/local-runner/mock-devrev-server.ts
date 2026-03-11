import express, { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Server } from 'http';
import zlib from 'zlib';

export interface CallbackEvent {
  event_type: string;
  event_context: Record<string, unknown>;
  event_data?: Record<string, unknown>;
  worker_metadata?: Record<string, unknown>;
}

export interface ArtifactMetadata {
  id: string;
  itemType: string;
  filename: string;
  filePath: string;
  /** Whether this is a binary file (e.g. streamed attachment) vs JSONL data artifact */
  isBinaryAttachment: boolean;
  /**
   * Whether downloads of this artifact should serve gzipped content.
   * Default (true) serves .gz — the SDK decompresses with isGzipped flag.
   * Set to false for stats files which the SDK fetches without isGzipped.
   */
  serveGzipped?: boolean;
}

export interface SyncMapperRecord {
  id: string;
  external_ids: string[];
  targets: string[];
  status: string;
  external_versions?: Array<{ modified_date: string; recipe_version: number }>;
  extra_data?: string;
}

export interface MockDevRevServerOptions {
  port: number;
  outputDir: string;
}

/**
 * Local Express server that mocks all DevRev backend endpoints.
 * Stores artifacts and state on disk under the output directory.
 */
export class MockDevRevServer {
  private app: Express;
  private server: Server | null = null;
  private port: number;
  private outputDir: string;
  private artifactsDir: string;
  private dataDir: string;
  public baseUrl: string;

  private artifactCounter = 0;
  private artifactMetadata: Map<string, ArtifactMetadata> = new Map();
  private lastCallback: CallbackEvent | null = null;
  private callbackResolve: ((event: CallbackEvent) => void) | null = null;

  // Sync mapper records: keyed by target ID for get-by-target lookups
  private syncMapperByTarget: Map<string, SyncMapperRecord> = new Map();
  // Also index by external_id for get-by-external-id lookups
  private syncMapperByExternalId: Map<string, SyncMapperRecord> = new Map();
  private syncMapperCounter = 0;
  private loadingDir: string;

  constructor({ port, outputDir }: MockDevRevServerOptions) {
    this.port = port;
    this.outputDir = outputDir;
    this.artifactsDir = path.join(outputDir, 'artifacts');
    this.dataDir = path.join(outputDir, 'data');
    this.loadingDir = path.join(outputDir, 'loading');
    this.baseUrl = `http://localhost:${this.port}`;
    this.app = express();
    this.ensureDirectories();
    this.setupRoutes();
  }

  private ensureDirectories(): void {
    for (const dir of [this.outputDir, this.artifactsDir, this.dataDir, this.loadingDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private setupRoutes(): void {
    // Parse JSON bodies with large limit (artifact arrays can be big)
    this.app.use(express.json({ limit: '50mb' }));

    // ──────────────────────────────────────────────
    // STATE ENDPOINTS
    // ──────────────────────────────────────────────

    this.app.get('/worker_data_url.get', (req: Request, res: Response) => {
      const statePath = path.join(this.outputDir, 'state.json');
      if (fs.existsSync(statePath)) {
        const state = fs.readFileSync(statePath, 'utf-8');
        res.status(200).json({ state });
      } else {
        // No state yet - return 404 so SDK initializes fresh state
        res.status(404).json({ message: 'State not found' });
      }
    });

    this.app.post('/worker_data_url.update', (req: Request, res: Response) => {
      const statePath = path.join(this.outputDir, 'state.json');
      const state = req.body.state;
      fs.writeFileSync(statePath, state, 'utf-8');
      res.status(200).json({ success: true });
    });

    // ──────────────────────────────────────────────
    // SNAP-IN METADATA
    // ──────────────────────────────────────────────

    this.app.get('/internal/snap-ins.get', (_req: Request, res: Response) => {
      res.status(200).json({
        snap_in: {
          imports: [{ name: 'local_import_slug' }],
          snap_in_version: { slug: 'local_snap_in_slug' },
        },
      });
    });

    // ──────────────────────────────────────────────
    // IDM INSTALLATION
    // ──────────────────────────────────────────────

    this.app.post(
      '/internal/airdrop.recipe.blueprints.create',
      (_req: Request, res: Response) => {
        res.status(200).json({
          recipe_blueprint: { id: 'local-blueprint-1' },
        });
      }
    );

    this.app.post(
      '/internal/airdrop.recipe.initial-domain-mappings.install',
      (req: Request, res: Response) => {
        // Save the installed IDM for inspection
        const idmPath = path.join(this.outputDir, 'installed_idm.json');
        fs.writeFileSync(idmPath, JSON.stringify(req.body, null, 2), 'utf-8');
        res.status(200).json({ success: true });
      }
    );

    // ──────────────────────────────────────────────
    // ARTIFACT UPLOAD FLOW
    // ──────────────────────────────────────────────

    this.app.get(
      '/internal/airdrop.artifacts.upload-url',
      (req: Request, res: Response) => {
        const fileType = (req.query.file_type as string) || 'application/x-gzip';
        const fileName = (req.query.file_name as string) || 'unknown';

        this.artifactCounter++;
        const artifactId = `local-artifact-${this.artifactCounter}`;

        // Detect binary attachment files vs JSONL data artifacts.
        // JSONL data artifacts have filenames like "todos.jsonl.gz".
        // Binary attachments (streamed files) have other extensions.
        const isJsonlArtifact = fileName.endsWith('.jsonl.gz') || fileName.endsWith('.jsonl');
        const isBinaryAttachment = !isJsonlArtifact;

        // Derive item type from filename (e.g. "todos.jsonl.gz" -> "todos")
        const itemType = fileName.replace(/\.jsonl\.gz$/, '').replace(/\.jsonl$/, '');

        const metadata: ArtifactMetadata = {
          id: artifactId,
          itemType,
          filename: fileName,
          filePath: isBinaryAttachment
            ? path.join(this.artifactsDir, `${fileName}_${artifactId}`)
            : path.join(this.artifactsDir, `${itemType}_${artifactId}.jsonl`),
          isBinaryAttachment,
        };
        this.artifactMetadata.set(artifactId, metadata);

        res.status(200).json({
          upload_url: `${this.baseUrl}/artifact-upload/${artifactId}`,
          artifact_id: artifactId,
          form_data: [],
        });
      }
    );

    // Handle multipart form data uploads (the SDK sends FormData)
    this.app.post(
      '/artifact-upload/:id',
      (req: Request, res: Response) => {
        const artifactId = req.params.id;
        const metadata = this.artifactMetadata.get(artifactId);

        if (!metadata) {
          res.status(404).json({ error: `Unknown artifact: ${artifactId}` });
          return;
        }

        // Extract boundary from Content-Type header
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        const boundary = boundaryMatch ? boundaryMatch[1] : null;

        // Collect the raw body
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const rawBody = Buffer.concat(chunks);

          // The SDK sends multipart form data. The file is the last field.
          // Extract the actual file content from multipart.
          const fileContent = this.extractFileFromMultipart(rawBody, boundary);

          if (!fileContent) {
            // Fallback: treat entire body as the file
            this.saveArtifact(metadata, rawBody);
          } else {
            this.saveArtifact(metadata, fileContent);
          }

          res.status(200).json({ success: true });
        });
      }
    );

    this.app.post(
      '/internal/airdrop.artifacts.confirm-upload',
      (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      }
    );

    // ──────────────────────────────────────────────
    // ARTIFACT DOWNLOAD FLOW
    // ──────────────────────────────────────────────

    this.app.get(
      '/internal/airdrop.artifacts.download-url',
      (req: Request, res: Response) => {
        const artifactId = req.query.artifact_id as string;
        const metadata = this.artifactMetadata.get(artifactId);

        if (!metadata || !fs.existsSync(metadata.filePath)) {
          res.status(404).json({ error: `Artifact not found: ${artifactId}` });
          return;
        }

        res.status(200).json({
          download_url: `${this.baseUrl}/artifact-download/${artifactId}`,
        });
      }
    );

    this.app.get(
      '/artifact-download/:id',
      (req: Request, res: Response) => {
        const artifactId = req.params.id;
        const metadata = this.artifactMetadata.get(artifactId);

        if (!metadata || !fs.existsSync(metadata.filePath)) {
          res.status(404).json({ error: `Artifact not found: ${artifactId}` });
          return;
        }

        if (metadata.isBinaryAttachment) {
          // Serve binary file as-is
          const content = fs.readFileSync(metadata.filePath);
          res.set('Content-Type', 'application/octet-stream');
          res.send(content);
          return;
        }

        // If serveGzipped is explicitly false, serve the plain JSONL content
        // (used for stats files which the SDK fetches without isGzipped flag)
        if (metadata.serveGzipped === false) {
          const content = fs.readFileSync(metadata.filePath, 'utf-8');
          res.set('Content-Type', 'application/jsonl');
          res.send(content);
          return;
        }

        // Default: serve the raw gzipped file (the SDK expects gzipped content for artifact downloads)
        const gzPath = metadata.filePath + '.gz';
        if (fs.existsSync(gzPath)) {
          const gzContent = fs.readFileSync(gzPath);
          res.set('Content-Type', 'application/x-gzip');
          res.send(gzContent);
        } else {
          // Fallback: gzip the JSONL on the fly
          const jsonlContent = fs.readFileSync(metadata.filePath, 'utf-8');
          const gzipped = zlib.gzipSync(Buffer.from(jsonlContent));
          res.set('Content-Type', 'application/x-gzip');
          res.send(gzipped);
        }
      }
    );

    // ──────────────────────────────────────────────
    // SYNC MAPPER RECORD ENDPOINTS (loading phase)
    // ──────────────────────────────────────────────

    this.app.get(
      '/internal/airdrop.sync-mapper-record.get-by-target',
      (req: Request, res: Response) => {
        const target = req.query.target as string;
        const record = this.syncMapperByTarget.get(target);

        if (!record) {
          res.status(404).json({ message: `Sync mapper record not found for target: ${target}` });
          return;
        }

        res.status(200).json({ sync_mapper_record: record });
      }
    );

    this.app.get(
      '/internal/airdrop.sync-mapper-record.get-by-external-id',
      (req: Request, res: Response) => {
        const externalId = req.query.external_id as string;
        const record = this.syncMapperByExternalId.get(externalId);

        if (!record) {
          res.status(404).json({ message: `Sync mapper record not found for external_id: ${externalId}` });
          return;
        }

        res.status(200).json({ sync_mapper_record: record });
      }
    );

    this.app.post(
      '/internal/airdrop.sync-mapper-record.create',
      (req: Request, res: Response) => {
        this.syncMapperCounter++;
        const recordId = `local-mapper-${this.syncMapperCounter}`;
        const record: SyncMapperRecord = {
          id: recordId,
          external_ids: req.body.external_ids || [],
          targets: req.body.targets || [],
          status: req.body.status || 'operational',
          external_versions: req.body.external_versions,
        };

        // Index by all targets
        for (const target of record.targets) {
          this.syncMapperByTarget.set(target, record);
        }
        // Index by all external IDs
        for (const extId of record.external_ids) {
          this.syncMapperByExternalId.set(extId, record);
        }

        // Persist to disk for reporting
        this.saveSyncMappers();

        res.status(200).json({ sync_mapper_record: record });
      }
    );

    this.app.post(
      '/internal/airdrop.sync-mapper-record.update',
      (req: Request, res: Response) => {
        const recordId = req.body.id;
        // Find existing record by ID
        let existingRecord: SyncMapperRecord | undefined;
        const allRecords = Array.from(this.syncMapperByTarget.values());
        for (const record of allRecords) {
          if (record.id === recordId) {
            existingRecord = record;
            break;
          }
        }

        if (!existingRecord) {
          res.status(404).json({ message: `Sync mapper record not found: ${recordId}` });
          return;
        }

        // Apply updates (add-style operations)
        if (req.body.external_ids?.add) {
          for (const extId of req.body.external_ids.add) {
            if (!existingRecord.external_ids.includes(extId)) {
              existingRecord.external_ids.push(extId);
            }
            this.syncMapperByExternalId.set(extId, existingRecord);
          }
        }
        if (req.body.targets?.add) {
          for (const target of req.body.targets.add) {
            if (!existingRecord.targets.includes(target)) {
              existingRecord.targets.push(target);
            }
            this.syncMapperByTarget.set(target, existingRecord);
          }
        }
        if (req.body.status) {
          existingRecord.status = req.body.status;
        }
        if (req.body.external_versions?.add) {
          if (!existingRecord.external_versions) {
            existingRecord.external_versions = [];
          }
          existingRecord.external_versions.push(...req.body.external_versions.add);
        }

        this.saveSyncMappers();

        res.status(200).json({ sync_mapper_record: existingRecord });
      }
    );

    // ──────────────────────────────────────────────
    // CALLBACK ENDPOINT (control protocol)
    // ──────────────────────────────────────────────

    this.app.post('/callback', (req: Request, res: Response) => {
      this.lastCallback = req.body as CallbackEvent;

      // If someone is waiting for a callback, resolve the promise
      if (this.callbackResolve) {
        this.callbackResolve(this.lastCallback);
        this.callbackResolve = null;
      }

      res.status(200).json({ success: true });
    });
  }

  /**
   * Extract the file content from a multipart/form-data request body.
   * Works entirely with Buffers to avoid corrupting binary (gzipped) data.
   *
   * The SDK sends FormData with one field: "file" (the gzipped JSONL).
   * Format: --boundary\r\nheaders\r\n\r\n<binary content>\r\n--boundary--\r\n
   *
   * The multipart may have multiple parts (if form_data was non-empty).
   * We look for the part with name="file" which contains the actual artifact.
   */
  private extractFileFromMultipart(body: Buffer, headerBoundary?: string | null): Buffer | null {
    const CRLFCRLF = Buffer.from('\r\n\r\n');
    const CRLF = Buffer.from('\r\n');

    // Determine the boundary string.
    // Prefer the boundary from Content-Type header; fall back to first line of body.
    let boundaryStr: string;
    if (headerBoundary) {
      boundaryStr = `--${headerBoundary}`;
    } else {
      const firstCRLF = body.indexOf(CRLF);
      if (firstCRLF === -1) return null;
      boundaryStr = body.subarray(0, firstCRLF).toString('ascii');
    }

    const boundaryBuf = Buffer.from(boundaryStr);
    const closingBoundaryBuf = Buffer.from(`${boundaryStr}--`);

    // Find all parts by splitting on the boundary
    let searchStart = 0;
    const parts: Array<{ headers: string; contentStart: number; contentEnd: number }> = [];

    while (true) {
      const boundaryIdx = body.indexOf(boundaryBuf, searchStart);
      if (boundaryIdx === -1) break;

      // Check if this is the closing boundary
      const potentialClosing = body.subarray(boundaryIdx, boundaryIdx + closingBoundaryBuf.length);
      if (potentialClosing.equals(closingBoundaryBuf)) break;

      // Skip past boundary + CRLF to get to part headers
      const partStart = boundaryIdx + boundaryBuf.length + CRLF.length;

      // Find end of headers (double CRLF)
      const headerEnd = body.indexOf(CRLFCRLF, partStart);
      if (headerEnd === -1) break;

      const headers = body.subarray(partStart, headerEnd).toString('utf-8');
      const contentStart = headerEnd + CRLFCRLF.length;

      // Find the next boundary to determine content end
      const nextBoundaryIdx = body.indexOf(boundaryBuf, contentStart);
      // Content ends at CRLF before the next boundary
      const contentEnd = nextBoundaryIdx !== -1
        ? nextBoundaryIdx - CRLF.length
        : body.length;

      parts.push({ headers, contentStart, contentEnd });
      searchStart = nextBoundaryIdx !== -1 ? nextBoundaryIdx : body.length;
    }

    if (parts.length === 0) return null;

    // Find the part named "file" (the SDK appends the gzipped buffer as the "file" field)
    for (const part of parts) {
      if (part.headers.includes('name="file"')) {
        return body.subarray(part.contentStart, part.contentEnd);
      }
    }

    // If no "file" part found, return the last part (most likely the file)
    const lastPart = parts[parts.length - 1];
    return body.subarray(lastPart.contentStart, lastPart.contentEnd);
  }

  /**
   * Save an artifact to disk. For JSONL artifacts, stores both the decompressed JSONL
   * (for human reading) and the raw gzipped content (for serving back to the SDK on download).
   * For binary attachments (streamed files), saves the raw binary content.
   */
  private saveArtifact(metadata: ArtifactMetadata, content: Buffer): void {
    if (metadata.isBinaryAttachment) {
      // Binary attachment - save as-is
      fs.writeFileSync(metadata.filePath, content);
      return;
    }

    let jsonlContent: string;

    try {
      // Try to decompress gzip
      const decompressed = zlib.gunzipSync(content);
      jsonlContent = decompressed.toString('utf-8');
      // Save the raw gzipped file for download serving
      const gzPath = metadata.filePath + '.gz';
      fs.writeFileSync(gzPath, content);
    } catch {
      // Not gzipped, treat as raw content
      jsonlContent = content.toString('utf-8');
      // Create a gzipped version for downloads
      const gzPath = metadata.filePath + '.gz';
      fs.writeFileSync(gzPath, zlib.gzipSync(content));
    }

    fs.writeFileSync(metadata.filePath, jsonlContent, 'utf-8');
  }

  /**
   * Persist all sync mapper records to disk for inspection and reporting.
   */
  private saveSyncMappers(): void {
    const uniqueRecords = new Map<string, SyncMapperRecord>();
    Array.from(this.syncMapperByTarget.values()).forEach((record) => {
      uniqueRecords.set(record.id, record);
    });
    const records = Array.from(uniqueRecords.values());
    const filePath = path.join(this.loadingDir, 'sync_mapper_records.json');
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
  }

  // ──────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          const actualPort = (
            this.server?.address() as { port: number } | null
          )?.port;
          if (actualPort) {
            this.port = actualPort;
            this.baseUrl = `http://localhost:${this.port}`;
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve, reject) => {
      this.server!.close((err) => {
        if (err) reject(err);
        else {
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Wait for the next callback event from the SDK's control protocol.
   * Returns immediately if a callback has already been received since the last call.
   */
  waitForCallback(timeoutMs = 5 * 60 * 1000): Promise<CallbackEvent> {
    if (this.lastCallback) {
      const cb = this.lastCallback;
      this.lastCallback = null;
      return Promise.resolve(cb);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.callbackResolve = null;
        reject(new Error(`Timed out waiting for callback after ${timeoutMs}ms`));
      }, timeoutMs);

      this.callbackResolve = (event: CallbackEvent) => {
        clearTimeout(timer);
        this.lastCallback = null;
        resolve(event);
      };
    });
  }

  /**
   * Clear the last received callback so the next waitForCallback will actually wait.
   */
  clearLastCallback(): void {
    this.lastCallback = null;
  }

  /**
   * Get metadata for all stored artifacts.
   */
  getArtifactMetadata(): ArtifactMetadata[] {
    return Array.from(this.artifactMetadata.values());
  }

  /**
   * Get metadata for artifacts of a specific item type.
   */
  getArtifactsByItemType(itemType: string): ArtifactMetadata[] {
    return Array.from(this.artifactMetadata.values()).filter(
      (a) => a.itemType === itemType
    );
  }

  /**
   * Read all records from all artifact files of a given item type.
   * Returns parsed JSON objects (one per JSONL line).
   * Skips binary attachment artifacts.
   */
  readArtifactRecords(itemType: string): object[] {
    const artifacts = this.getArtifactsByItemType(itemType);
    const records: object[] = [];

    for (const artifact of artifacts) {
      if (artifact.isBinaryAttachment) continue;
      if (!fs.existsSync(artifact.filePath)) continue;
      const content = fs.readFileSync(artifact.filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim().length > 0);
      for (const line of lines) {
        try {
          records.push(JSON.parse(line));
        } catch {
          // Skip malformed lines
        }
      }
    }

    return records;
  }

  /**
   * Get the output directory path.
   */
  getOutputDir(): string {
    return this.outputDir;
  }

  /**
   * Get the artifacts directory path.
   */
  getArtifactsDir(): string {
    return this.artifactsDir;
  }

  /**
   * Get the data directory path.
   */
  getDataDir(): string {
    return this.dataDir;
  }

  /**
   * Get the loading output directory path.
   */
  getLoadingDir(): string {
    return this.loadingDir;
  }

  /**
   * Get all sync mapper records created during loading.
   */
  getSyncMapperRecords(): SyncMapperRecord[] {
    const uniqueRecords = new Map<string, SyncMapperRecord>();
    Array.from(this.syncMapperByTarget.values()).forEach((record) => {
      uniqueRecords.set(record.id, record);
    });
    return Array.from(uniqueRecords.values());
  }

  /**
   * Build a stats file artifact from previously extracted data artifacts.
   * The stats file tells the loading worker what data to process.
   *
   * Also transforms extracted artifacts from extraction format (flat `id` string)
   * to loading format (`id: { devrev, external }`) — in production this transformation
   * is performed by the DevRev platform between extraction and loading.
   *
   * Returns the artifact ID of the stats file.
   */
  buildStatsFileFromExtractedData(): string | null {
    // Find all JSONL data artifacts (non-binary, non-metadata types)
    const allArtifacts = this.getArtifactMetadata();
    const skipTypes = new Set(['external_domain_metadata', 'ssor_attachment', 'external_sync_units', 'stats', 'attachment_stats']);

    // Group artifacts by item type
    const byType = new Map<string, ArtifactMetadata[]>();
    for (const artifact of allArtifacts) {
      if (artifact.isBinaryAttachment) continue;
      if (skipTypes.has(artifact.itemType)) continue;
      if (!fs.existsSync(artifact.filePath)) continue;

      const existing = byType.get(artifact.itemType) || [];
      existing.push(artifact);
      byType.set(artifact.itemType, existing);
    }

    if (byType.size === 0) return null;

    // Transform each artifact to loading format and create new "transformer" artifacts.
    // In production, the DevRev platform assigns DevRev IDs to each item. We simulate
    // this by generating local DevRev IDs.
    const statsEntries: Array<{
      id: string;
      item_type: string;
      file_name: string;
      count: string;
    }> = [];

    let devrevIdCounter = 0;

    Array.from(byType.entries()).forEach(([itemType, artifacts]) => {
      for (const artifact of artifacts) {
        const content = fs.readFileSync(artifact.filePath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);

        // Transform each record to loading format
        const transformedRecords: string[] = [];
        for (const line of lines) {
          try {
            const record = JSON.parse(line);
            devrevIdCounter++;
            const externalId = typeof record.id === 'string' ? record.id : record.id?.external || `ext-${devrevIdCounter}`;
            const devrevId = `don:core:dvrv-us-1:devo/local:${itemType}/${devrevIdCounter}`;

            const transformedRecord = {
              ...record,
              id: {
                devrev: devrevId,
                external: externalId,
              },
            };
            transformedRecords.push(JSON.stringify(transformedRecord));
          } catch {
            // Skip malformed lines
            transformedRecords.push(line);
          }
        }

        // Create a new transformer artifact with the loading-format data
        this.artifactCounter++;
        const transformerArtifactId = `local-artifact-${this.artifactCounter}`;
        const transformerFilename = `${itemType}_transformer_${transformerArtifactId}.jsonl`;
        const transformerFilePath = path.join(this.artifactsDir, transformerFilename);

        const transformedContent = transformedRecords.join('\n');
        fs.writeFileSync(transformerFilePath, transformedContent, 'utf-8');
        // Also create gzipped version (loading worker fetches with isGzipped: true)
        fs.writeFileSync(transformerFilePath + '.gz', zlib.gzipSync(Buffer.from(transformedContent)));

        const transformerMetadata: ArtifactMetadata = {
          id: transformerArtifactId,
          itemType,
          filename: `${itemType}.jsonl.gz`,
          filePath: transformerFilePath,
          isBinaryAttachment: false,
        };
        this.artifactMetadata.set(transformerArtifactId, transformerMetadata);

        statsEntries.push({
          id: transformerArtifactId,
          item_type: itemType,
          file_name: `${itemType}.jsonl.gz`,
          count: String(transformedRecords.length),
        });
      }
    });

    // Create a stats file artifact (plain JSONL, NOT gzipped - SDK fetches without isGzipped flag)
    this.artifactCounter++;
    const statsArtifactId = `local-artifact-${this.artifactCounter}`;
    const statsFilePath = path.join(this.artifactsDir, `stats_${statsArtifactId}.jsonl`);

    // Write as JSONL (one JSON object per line)
    const jsonlContent = statsEntries.map((e) => JSON.stringify(e)).join('\n');
    fs.writeFileSync(statsFilePath, jsonlContent, 'utf-8');

    // Also create the gzipped version for download
    fs.writeFileSync(statsFilePath + '.gz', zlib.gzipSync(Buffer.from(jsonlContent)));

    const metadata: ArtifactMetadata = {
      id: statsArtifactId,
      itemType: 'stats',
      filename: 'stats.jsonl',
      filePath: statsFilePath,
      isBinaryAttachment: false,
      serveGzipped: false,
    };
    this.artifactMetadata.set(statsArtifactId, metadata);

    return statsArtifactId;
  }

  /**
   * Build a stats file artifact for attachment data.
   * Also transforms attachment records to loading format with `{ devrev, external }` IDs.
   * Returns the artifact ID of the attachment stats file.
   */
  buildStatsFileFromExtractedAttachments(): string | null {
    const ssorArtifacts = this.getArtifactsByItemType('ssor_attachment');
    if (ssorArtifacts.length === 0) return null;

    const statsEntries: Array<{
      id: string;
      item_type: string;
      file_name: string;
      count: string;
    }> = [];

    let devrevIdCounter = 0;

    for (const artifact of ssorArtifacts) {
      if (artifact.isBinaryAttachment) continue;
      if (!fs.existsSync(artifact.filePath)) continue;

      const content = fs.readFileSync(artifact.filePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);

      // Transform to loading format
      const transformedRecords: string[] = [];
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          devrevIdCounter++;
          const externalId = typeof record.id === 'string' ? record.id : record.id?.external || `ext-att-${devrevIdCounter}`;
          const devrevId = record.id?.devrev || `don:core:dvrv-us-1:devo/local:attachment/${devrevIdCounter}`;

          const transformedRecord = {
            ...record,
            id: externalId,
            reference_id: devrevId,
          };
          transformedRecords.push(JSON.stringify(transformedRecord));
        } catch {
          transformedRecords.push(line);
        }
      }

      // Create transformer artifact
      this.artifactCounter++;
      const transformerArtifactId = `local-artifact-${this.artifactCounter}`;
      const transformerFilename = `attachment_transformer_${transformerArtifactId}.jsonl`;
      const transformerFilePath = path.join(this.artifactsDir, transformerFilename);

      const transformedContent = transformedRecords.join('\n');
      fs.writeFileSync(transformerFilePath, transformedContent, 'utf-8');
      fs.writeFileSync(transformerFilePath + '.gz', zlib.gzipSync(Buffer.from(transformedContent)));

      const transformerMetadata: ArtifactMetadata = {
        id: transformerArtifactId,
        itemType: 'ssor_attachment',
        filename: 'ssor_attachment.jsonl.gz',
        filePath: transformerFilePath,
        isBinaryAttachment: false,
      };
      this.artifactMetadata.set(transformerArtifactId, transformerMetadata);

      statsEntries.push({
        id: transformerArtifactId,
        item_type: 'attachment',
        file_name: 'ssor_attachment.jsonl.gz',
        count: String(transformedRecords.length),
      });
    }

    if (statsEntries.length === 0) return null;

    this.artifactCounter++;
    const statsArtifactId = `local-artifact-${this.artifactCounter}`;
    const statsFilePath = path.join(this.artifactsDir, `attachment_stats_${statsArtifactId}.jsonl`);

    const jsonlContent = statsEntries.map((e) => JSON.stringify(e)).join('\n');
    fs.writeFileSync(statsFilePath, jsonlContent, 'utf-8');
    fs.writeFileSync(statsFilePath + '.gz', zlib.gzipSync(Buffer.from(jsonlContent)));

    const metadata: ArtifactMetadata = {
      id: statsArtifactId,
      itemType: 'attachment_stats',
      filename: 'attachment_stats.jsonl',
      filePath: statsFilePath,
      isBinaryAttachment: false,
      serveGzipped: false,
    };
    this.artifactMetadata.set(statsArtifactId, metadata);

    return statsArtifactId;
  }

  /**
   * Reset loading-specific state (sync mapper records) for a fresh loading run.
   * Does NOT reset artifacts or extraction state.
   */
  resetLoadingState(): void {
    this.syncMapperByTarget.clear();
    this.syncMapperByExternalId.clear();
    this.syncMapperCounter = 0;
  }

  /**
   * Reconstitute artifact metadata from previously extracted files on disk.
   * Used by --loading-only mode to rebuild the in-memory artifact index
   * from a prior extraction run's output.
   */
  reconstitueArtifactsFromDisk(): number {
    if (!fs.existsSync(this.artifactsDir)) return 0;

    const files = fs.readdirSync(this.artifactsDir);
    // Process .jsonl files (skip .gz files, they're companions)
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl') && !f.endsWith('.jsonl.gz'));
    // Process binary files (non-.jsonl, non-.gz)
    const otherFiles = files.filter(
      (f) => !f.endsWith('.jsonl') && !f.endsWith('.gz')
    );

    let count = 0;

    for (const file of jsonlFiles) {
      // File pattern: <itemType>_local-artifact-<N>.jsonl
      const match = file.match(/^(.+)_local-artifact-(\d+)\.jsonl$/);
      if (!match) continue;

      const itemType = match[1];
      const artifactNum = parseInt(match[2]);
      const artifactId = `local-artifact-${artifactNum}`;

      // Skip if already registered
      if (this.artifactMetadata.has(artifactId)) continue;

      const filePath = path.join(this.artifactsDir, file);
      const originalFilename = `${itemType}.jsonl.gz`;

      const metadata: ArtifactMetadata = {
        id: artifactId,
        itemType,
        filename: originalFilename,
        filePath,
        isBinaryAttachment: false,
      };
      this.artifactMetadata.set(artifactId, metadata);
      this.artifactCounter = Math.max(this.artifactCounter, artifactNum);
      count++;
    }

    for (const file of otherFiles) {
      // Binary file pattern: <filename>_local-artifact-<N>
      const match = file.match(/^(.+)_local-artifact-(\d+)$/);
      if (!match) continue;

      const originalFilename = match[1];
      const artifactNum = parseInt(match[2]);
      const artifactId = `local-artifact-${artifactNum}`;

      if (this.artifactMetadata.has(artifactId)) continue;

      const metadata: ArtifactMetadata = {
        id: artifactId,
        itemType: originalFilename,
        filename: originalFilename,
        filePath: path.join(this.artifactsDir, file),
        isBinaryAttachment: true,
      };
      this.artifactMetadata.set(artifactId, metadata);
      this.artifactCounter = Math.max(this.artifactCounter, artifactNum);
      count++;
    }

    return count;
  }
}
