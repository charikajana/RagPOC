import * as fs from 'fs';
import * as path from 'path';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { glob } from 'glob';

// ─────────────────────────────────────────────────────────────────────────────
// Source type labels stored in ChromaDB metadata
// ─────────────────────────────────────────────────────────────────────────────
export type SourceType =
  | 'feature-file'
  | 'step-definition'
  | 'action-class'
  | 'healer-class'
  | 'locator-class'
  | 'test-data'
  | 'rest-api-config'
  | 'soap-config'
  | 'file-upload-data'
  | 'configuration'
  | 'documentation'
  | 'page-object'
  | 'utility-class'
  | 'unknown';

// ─────────────────────────────────────────────────────────────────────────────
// Folder name patterns → SourceType mapping
// The loader walks the repo root and matches any folder whose name contains
// one of the keys below (case-insensitive).
// Add more entries here if your team uses different folder names.
// ─────────────────────────────────────────────────────────────────────────────
const FOLDER_SOURCE_MAP: Array<{ pattern: RegExp; source: SourceType }> = [
  { pattern: /feature[s]?$/i,          source: 'feature-file'      },
  { pattern: /step[s]?[_-]?def/i,      source: 'step-definition'   },
  { pattern: /stepdefinition[s]?$/i,   source: 'step-definition'   },
  { pattern: /action[s]?$/i,           source: 'action-class'       },
  { pattern: /heal(er)?[s]?$/i,        source: 'healer-class'       },
  { pattern: /locator[s]?$/i,          source: 'locator-class'      },
  { pattern: /page[s]?[_-]?object[s]?$/i, source: 'page-object'    },
  { pattern: /pom[s]?$/i,              source: 'page-object'        },
  { pattern: /testdata$/i,             source: 'test-data'          },
  { pattern: /test[_-]?data$/i,        source: 'test-data'          },
  { pattern: /rest[_-]?api$/i,         source: 'rest-api-config'    },
  { pattern: /api[_-]?request[s]?$/i,  source: 'rest-api-config'    },
  { pattern: /soap$/i,                 source: 'soap-config'        },
  { pattern: /wsdl[s]?$/i,             source: 'soap-config'        },
  { pattern: /upload[s]?$/i,           source: 'file-upload-data'   },
  { pattern: /fixture[s]?$/i,          source: 'file-upload-data'   },
  { pattern: /config[s]?$/i,           source: 'configuration'      },
  { pattern: /configuration[s]?$/i,    source: 'configuration'      },
  { pattern: /properties$/i,           source: 'configuration'      },
  { pattern: /util[s]?$/i,             source: 'utility-class'      },
  { pattern: /helper[s]?$/i,           source: 'utility-class'      },
  { pattern: /doc[s]?$/i,              source: 'documentation'      },
  { pattern: /resources$/i,            source: 'test-data'          },
];

// ─────────────────────────────────────────────────────────────────────────────
// File extension → readable label + whether to embed
// ─────────────────────────────────────────────────────────────────────────────
const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.feature':    'gherkin',
  '.ts':         'typescript',
  '.js':         'javascript',
  '.java':       'java',
  '.py':         'python',
  '.json':       'json',
  '.xml':        'xml',
  '.yaml':       'yaml',
  '.yml':        'yaml',
  '.properties': 'properties',
  '.env':        'env',
  '.csv':        'csv',
  '.txt':        'text',
  '.md':         'markdown',
  '.graphql':    'graphql',
  '.wsdl':       'wsdl',
  '.xsd':        'xsd',
};

// Binary / large files we skip
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.jar', '.war', '.ear',
  '.class', '.bin', '.exe', '.dll', '.so', '.dylib',
  '.lock', '.log', '.map',
]);

// Folders we always ignore (node_modules, build output, etc.)
const IGNORE_DIRS = [
  'node_modules', '.git', '.github', 'dist', 'build', 'target',
  '.idea', '.vscode', '__pycache__', '.pytest_cache', 'coverage',
  '.nyc_output', 'allure-results', 'allure-report', 'reports', 'screenshots',
];

// ─────────────────────────────────────────────────────────────────────────────
// Discovered folder entry
// ─────────────────────────────────────────────────────────────────────────────
export interface DiscoveredFolder {
  absolutePath: string;
  relativePath: string;
  source: SourceType;
  fileCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// RepoLoader
// ─────────────────────────────────────────────────────────────────────────────
export class RepoLoader {
  private readonly splitter: RecursiveCharacterTextSplitter;
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = path.resolve(repoRoot);
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 700,
      chunkOverlap: 70,
      separators: ['\n\n', '\n', ' ', ''],
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 1: Walk the repo and find all recognisable folders
  // ───────────────────────────────────────────────────────────────────────────
  discoverFolders(): DiscoveredFolder[] {
    const results: DiscoveredFolder[] = [];
    this._walkDir(this.repoRoot, results);

    console.log(`\n🔍 Discovered ${results.length} relevant folder(s) in: ${this.repoRoot}`);
    results.forEach(f => {
      console.log(`   [${f.source.padEnd(18)}]  ${f.relativePath}  (${f.fileCount} files)`);
    });

    return results;
  }

  private _walkDir(dir: string, results: DiscoveredFolder[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // permission error — skip
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORE_DIRS.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath  = path.relative(this.repoRoot, fullPath);

      // Check if folder name matches any known pattern
      const match = FOLDER_SOURCE_MAP.find(m => m.pattern.test(entry.name));
      if (match) {
        const files = this._listSupportedFiles(fullPath);
        results.push({
          absolutePath: fullPath,
          relativePath: relPath,
          source: match.source,
          fileCount: files.length,
        });
      }

      // Always recurse deeper
      this._walkDir(fullPath, results);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 2: Load all documents from discovered folders
  // ───────────────────────────────────────────────────────────────────────────
  async loadAll(folders?: DiscoveredFolder[]): Promise<Document[]> {
    const targets = folders ?? this.discoverFolders();
    const allDocs: Document[] = [];

    for (const folder of targets) {
      const docs = await this._loadFolder(folder);
      allDocs.push(...docs);
    }

    return allDocs;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Load a specific folder by absolute path + source label override
  // ───────────────────────────────────────────────────────────────────────────
  async loadFolder(folderPath: string, sourceOverride?: SourceType): Promise<Document[]> {
    const absPath = path.resolve(folderPath);
    const relPath = path.relative(this.repoRoot, absPath);
    const source  = sourceOverride ?? this._inferSource(path.basename(absPath));

    return this._loadFolder({ absolutePath: absPath, relativePath: relPath, source, fileCount: 0 });
  }

  // ─────────────────────────────────────── internal ────────────────────────
  private async _loadFolder(folder: DiscoveredFolder): Promise<Document[]> {
    const files = this._listSupportedFiles(folder.absolutePath);
    const docs:  Document[] = [];

    for (const filePath of files) {
      const ext        = path.extname(filePath).toLowerCase();
      const fileType   = SUPPORTED_EXTENSIONS[ext] ?? 'text';
      const relFile    = path.relative(this.repoRoot, filePath);

      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        console.warn(`  ⚠️  Could not read: ${relFile}`);
        continue;
      }

      if (!content.trim()) continue;

      const chunks = await this.splitter.splitText(content);

      chunks.forEach((chunk, idx) => {
        docs.push(
          new Document({
            pageContent: chunk,
            metadata: {
              source:       folder.source,
              filePath:     relFile,
              fileName:     path.basename(filePath),
              folderName:   path.basename(folder.absolutePath),
              fileType,
              repoRoot:     this.repoRoot,
              chunkIndex:   idx,
              totalChunks:  chunks.length,
            },
          })
        );
      });
    }

    if (docs.length > 0) {
      console.log(`  ✅ [${folder.source}]  ${folder.relativePath}  → ${docs.length} chunks`);
    } else {
      console.log(`  ⚠️  [${folder.source}]  ${folder.relativePath}  → 0 chunks (empty/unsupported)`);
    }

    return docs;
  }

  // List all readable files (non-binary) in a directory recursively
  private _listSupportedFiles(dir: string): string[] {
    const pattern = '**/*';
    let files: string[] = [];
    try {
      files = glob.sync(pattern, {
        cwd:      dir,
        absolute: true,
        nodir:    true,
        ignore:   IGNORE_DIRS.map(d => `**/${d}/**`),
      });
    } catch {
      return [];
    }

    return files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return !SKIP_EXTENSIONS.has(ext) && Object.keys(SUPPORTED_EXTENSIONS).includes(ext);
    });
  }

  // Infer source from a folder name when caller doesn't specify
  private _inferSource(folderName: string): SourceType {
    const match = FOLDER_SOURCE_MAP.find(m => m.pattern.test(folderName));
    return match ? match.source : 'unknown';
  }
}
