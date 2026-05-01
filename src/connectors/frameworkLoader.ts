import * as fs from 'fs';
import * as path from 'path';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { glob } from 'glob';

/**
 * Loads Cucumber .feature files and TypeScript step definitions
 * from the local framework directory, converting them into
 * LangChain Documents so the AI learns the project's coding style.
 */
export class FrameworkLoader {
  private readonly splitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 600,
      chunkOverlap: 60,
      separators: ['\n\n', '\n', ' ', ''],
    });
  }

  /**
   * Load all .feature files from a given directory.
   */
  async loadFeatureFiles(featuresDir: string): Promise<Document[]> {
    const resolvedDir = path.resolve(featuresDir);

    if (!fs.existsSync(resolvedDir)) {
      console.warn(`⚠️  Features directory not found: ${resolvedDir}`);
      return [];
    }

    const files = await glob('**/*.feature', {
      cwd: resolvedDir,
      absolute: true,
    });

    console.log(`📂 Found ${files.length} .feature files in ${resolvedDir}`);

    const docs: Document[] = [];
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(resolvedDir, filePath);
      const featureName = extractFeatureName(content);

      const chunks = await this.splitter.splitText(content);
      chunks.forEach((chunk, idx) => {
        docs.push(
          new Document({
            pageContent: chunk,
            metadata: {
              source: 'feature-file',
              filePath: relativePath,
              featureName,
              fileType: 'gherkin',
              chunkIndex: idx,
              totalChunks: chunks.length,
            },
          })
        );
      });
    }

    console.log(`✅ Loaded ${docs.length} chunks from feature files`);
    return docs;
  }

  /**
   * Load all TypeScript step definition files.
   */
  async loadStepDefinitions(stepsDir: string): Promise<Document[]> {
    const resolvedDir = path.resolve(stepsDir);

    if (!fs.existsSync(resolvedDir)) {
      console.warn(`⚠️  Steps directory not found: ${resolvedDir}`);
      return [];
    }

    const files = await glob('**/*.{ts,js}', {
      cwd: resolvedDir,
      absolute: true,
    });

    console.log(`📂 Found ${files.length} step definition files in ${resolvedDir}`);

    const docs: Document[] = [];
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(resolvedDir, filePath);

      const chunks = await this.splitter.splitText(content);
      chunks.forEach((chunk, idx) => {
        docs.push(
          new Document({
            pageContent: chunk,
            metadata: {
              source: 'step-definition',
              filePath: relativePath,
              fileType: 'typescript',
              chunkIndex: idx,
              totalChunks: chunks.length,
            },
          })
        );
      });
    }

    console.log(`✅ Loaded ${docs.length} chunks from step definitions`);
    return docs;
  }

  /**
   * Load all Markdown or PDF documentation files.
   */
  async loadDocs(docsDir: string): Promise<Document[]> {
    const resolvedDir = path.resolve(docsDir);

    if (!fs.existsSync(resolvedDir)) {
      console.warn(`⚠️  Docs directory not found: ${resolvedDir}`);
      return [];
    }

    const mdFiles = await glob('**/*.{md,txt}', {
      cwd: resolvedDir,
      absolute: true,
    });

    console.log(`📂 Found ${mdFiles.length} doc files in ${resolvedDir}`);

    const docs: Document[] = [];

    // Load markdown/txt files
    for (const filePath of mdFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(resolvedDir, filePath);

      const chunks = await this.splitter.splitText(content);
      chunks.forEach((chunk, idx) => {
        docs.push(
          new Document({
            pageContent: chunk,
            metadata: {
              source: 'documentation',
              filePath: relativePath,
              fileType: path.extname(filePath).slice(1),
              chunkIndex: idx,
              totalChunks: chunks.length,
            },
          })
        );
      });
    }

    // Load PDF files if pdf-parse is available
    try {
      const pdfFiles = await glob('**/*.pdf', {
        cwd: resolvedDir,
        absolute: true,
      });

      if (pdfFiles.length > 0) {
        const pdfParse = await import('pdf-parse');

        for (const filePath of pdfFiles) {
          const buffer = fs.readFileSync(filePath);
          const data = await pdfParse.default(buffer);
          const relativePath = path.relative(resolvedDir, filePath);

          const chunks = await this.splitter.splitText(data.text);
          chunks.forEach((chunk, idx) => {
            docs.push(
              new Document({
                pageContent: chunk,
                metadata: {
                  source: 'documentation',
                  filePath: relativePath,
                  fileType: 'pdf',
                  totalPages: data.numpages,
                  chunkIndex: idx,
                  totalChunks: chunks.length,
                },
              })
            );
          });
        }
      }
    } catch {
      console.warn('⚠️  pdf-parse not available, skipping PDF files.');
    }

    console.log(`✅ Loaded ${docs.length} chunks from documentation`);
    return docs;
  }
}

/**
 * Extracts the Feature name from a .feature file's first line.
 */
function extractFeatureName(content: string): string {
  const match = content.match(/Feature:\s*(.+)/i);
  return match ? match[1].trim() : 'Unknown Feature';
}
