import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * A JSON file read through `parse`, which validates the content and fills in defaults.
 * Writes are atomic (temporary file, then rename) and run one at a time.
 */
export class JsonFile<T> {
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly parse: (content: unknown) => T,
  ) {}

  /** A missing file gives the defaults. A damaged one is kept as "<name>.broken-<time>" first, so saving can't destroy it. */
  async load(): Promise<T> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return this.parse(undefined);
      throw error;
    }
    try {
      return this.parse(JSON.parse(text));
    } catch {
      const backupPath = `${this.filePath}.broken-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await rename(this.filePath, backupPath);
      console.warn(`${this.filePath} could not be read; it was kept as ${backupPath}.`);
      return this.parse(undefined);
    }
  }

  save(value: T): Promise<void> {
    const content = JSON.stringify(value, null, 2);
    this.pendingWrite = this.pendingWrite.catch(() => {}).then(() => this.write(content));
    return this.pendingWrite;
  }

  private async write(content: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, this.filePath);
  }
}
