import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ToolSetup, ToolsMissingError, type InstallStep, type ToolSetupDependencies } from '../src/server/services/tools.js';

const DAY = 24 * 3600 * 1000;

function createFakeSetup({ installed = false, updateSucceeds = true } = {}) {
  const tool = { installed, installCount: 0, updateCount: 0 };
  const clock = { now: 100 * DAY, lastSuccessfulCheck: 0 };
  const step: InstallStep = {
    name: 'yt-dlp',
    downloadSizeMegabytes: 17,
    isInstalled: () => tool.installed,
    install: async (onProgress) => {
      onProgress(1);
      tool.installCount++;
      tool.installed = true;
    },
  };
  const dependencies: ToolSetupDependencies = {
    steps: [step],
    prepareFolders: async () => {},
    updateYtdlp: async () => {
      tool.updateCount++;
      return updateSucceeds;
    },
    readYtdlpVersion: async () => '2026.10.21',
    lastSuccessfulUpdateCheck: () => clock.lastSuccessfulCheck,
    recordSuccessfulUpdateCheck: async () => {
      clock.lastSuccessfulCheck = clock.now;
    },
    now: () => clock.now,
  };
  return { setup: new ToolSetup(dependencies), tool, clock };
}

describe('ToolSetup', () => {
  it('waits for the user when tools are missing, then installs them', async () => {
    const { setup, tool } = createFakeSetup();
    setup.initialize();
    assert.deepEqual([setup.status().state, setup.status().installed, setup.status().downloadSizeMegabytes], ['missing', false, 17]);
    await assert.rejects(setup.require(), ToolsMissingError);

    await setup.ensure();
    assert.equal(tool.installCount, 1);
    assert.equal(setup.status().state, 'ready');
    assert.equal(setup.ytdlpVersion, '2026.10.21');
    await setup.require();
  });

  it('reinstalls a tool that disappears after setup', async () => {
    const { setup, tool } = createFakeSetup({ installed: true });
    await setup.ensure();
    tool.installed = false;
    assert.equal(setup.status().state, 'missing');
    await assert.rejects(setup.require(), ToolsMissingError);
    await setup.ensure();
    assert.equal(tool.installCount, 1);
    assert.equal(setup.status().state, 'ready');
  });

  it('checks for updates once a week, retrying a failed check a day later', async () => {
    const { setup, tool, clock } = createFakeSetup({ installed: true, updateSucceeds: false });
    await setup.ensure();
    assert.equal(tool.updateCount, 1);

    setup.checkForUpdate();
    await setup.ensure();
    assert.equal(tool.updateCount, 1, 'a failed check is not retried within a day');

    clock.now += DAY;
    setup.checkForUpdate();
    await setup.ensure();
    assert.equal(tool.updateCount, 2);
  });

  it('does not check again for a week after a successful update check', async () => {
    const { setup, tool, clock } = createFakeSetup({ installed: true });
    await setup.ensure();
    clock.now += 6 * DAY;
    setup.checkForUpdate();
    await setup.ensure();
    assert.equal(tool.updateCount, 1);
    clock.now += DAY;
    setup.checkForUpdate();
    await setup.ensure();
    assert.equal(tool.updateCount, 2);
  });

  it('reports a failed install and lets the user try again', async () => {
    const { setup, tool } = createFakeSetup();
    let failNext = true;
    const step = (setup as unknown as { dependencies: ToolSetupDependencies }).dependencies.steps[0]!;
    const realInstall = step.install;
    step.install = async (onProgress) => {
      if (failNext) {
        failNext = false;
        throw new Error('Downloading yt-dlp failed (HTTP 503).');
      }
      return realInstall(onProgress);
    };
    await assert.rejects(setup.ensure(), /HTTP 503/);
    assert.deepEqual([setup.status().state, setup.status().message], ['error', 'Downloading yt-dlp failed (HTTP 503).']);
    await setup.ensure();
    assert.equal(tool.installed, true);
    assert.equal(setup.status().state, 'ready');
  });
});
