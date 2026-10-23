import { partialFolderFor, removePartialFolder } from './partial-folders.js'

export class JobFolders {
  private readonly downloadFolderByJobId = new Map<string, string>()

  constructor(private readonly currentDownloadFolder: () => string) {}

  remember(jobId: string, downloadFolder: string | null): void {
    if (downloadFolder) this.downloadFolderByJobId.set(jobId, downloadFolder)
  }

  savedFolder(jobId: string): string | null {
    return this.downloadFolderByJobId.get(jobId) ?? null
  }

  folderFor(jobId: string): string {
    const downloadFolder = this.downloadFolderByJobId.get(jobId) ?? this.currentDownloadFolder()

    this.downloadFolderByJobId.set(jobId, downloadFolder)

    return downloadFolder
  }

  async discardPartialFiles(jobId: string): Promise<void> {
    const downloadFolder = this.downloadFolderByJobId.get(jobId)

    this.downloadFolderByJobId.delete(jobId)

    if (downloadFolder) await removePartialFolder(partialFolderFor(downloadFolder, jobId))
  }
}
