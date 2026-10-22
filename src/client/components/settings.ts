import { api } from '../api.js';
import { desktopBridge } from '../desktop.js';
import { errorMessage, findElement, showToast } from '../utils/dom.js';

export function initialize(): void {
  const dialog = findElement<HTMLDialogElement>('#settingsDialog');
  const folderInput = findElement<HTMLInputElement>('#downloadFolderInput');
  const simultaneousSelect = findElement<HTMLSelectElement>('#simultaneousDownloadsSelect');
  const renderingCheckbox = findElement<HTMLInputElement>('#lowLatencyRenderingCheckbox');

  findElement('#openSettingsButton').addEventListener('click', () => {
    dialog.showModal();
    api.status().then(
      (status) => {
        folderInput.value = status.downloadFolder;
        simultaneousSelect.value = String(status.simultaneousDownloads);
        renderingCheckbox.checked = status.lowLatencyRendering;
        findElement('#renderingSetting').hidden = !desktopBridge || !status.platform.startsWith('win32');
        findElement('#folderExample').textContent = status.platform.startsWith('win') ? 'D:\\Music\\YouTube' : '/home/you/Music/YouTube';
        findElement('#versionInfo').textContent = `yt-dlp ${status.ytdlpVersion ?? '(not installed yet)'} · ${status.platform}`;
      },
      (error: unknown) => showToast(errorMessage(error)),
    );
  });

  const saveFolder = async (folder: string) => {
    try {
      folderInput.value = (await api.saveSettings({ downloadFolder: folder })).downloadFolder;
      showToast('Saved. New downloads go to that folder.');
    } catch (error) {
      showToast(errorMessage(error), 6000);
    }
  };
  findElement('#saveFolderButton').addEventListener('click', () => void saveFolder(folderInput.value));

  if (desktopBridge) {
    const browseButton = findElement('#browseFolderButton');
    const bridge = desktopBridge;
    browseButton.hidden = false;
    browseButton.addEventListener('click', async () => {
      const folder = await bridge.pickFolder(folderInput.value);
      if (folder) await saveFolder(folder);
    });
  }

  simultaneousSelect.addEventListener('change', async () => {
    await api.saveSettings({ simultaneousDownloads: Number(simultaneousSelect.value) }).catch(() => {});
    showToast('Saved.');
  });

  renderingCheckbox.addEventListener('change', async () => {
    await api.saveSettings({ lowLatencyRendering: renderingCheckbox.checked }).catch(() => {});
    showToast('Saved. Restart the app to apply it.');
  });

  findElement('#openFolderButton').addEventListener('click', () => {
    api.openDownloadFolder().catch((error: unknown) => showToast(errorMessage(error)));
  });
}
