import { describe, expect, it, vi } from 'vitest';
import {
  buildFolderPickerCommand,
  buildOpenCommand,
  buildRevealCommand,
  buildRevealFolderCommand,
  buildWindowsRevealScript,
  createNativeActions,
  detachedSpawnOptions,
  type NativeActionDeps,
  type NativeCommand,
  type RunCaptureResult,
} from './native-actions';

const idle: RunCaptureResult = { code: 0, stdout: '', stderr: '', spawnFailed: false, timedOut: false };

function makeDeps(overrides: Partial<NativeActionDeps> = {}) {
  const spawned: NativeCommand[] = [];
  return {
    platform: 'win32',
    fileExists: () => true,
    getEntryPath: () => 'C:/Media/2025/a.jpg',
    getConfiguredRoots: () => ['C:/Media'],
    spawnDetached: (command: NativeCommand) => {
      spawned.push(command);
    },
    runAndCapture: vi.fn(async () => idle),
    spawned,
    ...overrides,
  };
}

describe('command builders', () => {
  it('builds a Windows reveal as an encoded PowerShell command', () => {
    const command = buildRevealCommand('win32', 'C:\\My Photos\\a,b.jpg');
    expect(command?.command).toBe('powershell');
    expect(command?.args.slice(0, 2)).toEqual(['-NoProfile', '-EncodedCommand']);
    const script = Buffer.from(command!.args[2], 'base64').toString('utf16le');
    expect(script).toContain('Start-Process explorer');
    expect(script).toContain('/select,"');
    expect(buildRevealCommand('darwin', '/a.jpg')).toEqual({ command: 'open', args: ['-R', '/a.jpg'] });
    expect(buildRevealCommand('linux', '/dir/a.jpg')).toEqual({ command: 'xdg-open', args: ['/dir'] });
    expect(buildRevealCommand('freebsd', '/a.jpg')).toBeNull();
  });

  it('builds reveal-folder commands per platform', () => {
    const windows = buildRevealFolderCommand('win32', 'C:\\Media');
    expect(windows?.command).toBe('powershell');
    const script = Buffer.from(windows!.args[2], 'base64').toString('utf16le');
    expect(script).toContain('Start-Process explorer');
    expect(buildRevealFolderCommand('darwin', '/media')).toEqual({ command: 'open', args: ['/media'] });
    expect(buildRevealFolderCommand('linux', '/media')).toEqual({ command: 'xdg-open', args: ['/media'] });
    expect(buildRevealFolderCommand('freebsd', '/media')).toBeNull();
  });

  it('forces the containing folder window when revealing a file', () => {
    const script = buildWindowsRevealScript('C:\\Media\\2025\\a.jpg', 'select');
    expect(script).toContain("$leaf = '2025'");
  });

  it('forces the folder window when revealing a folder', () => {
    const script = buildWindowsRevealScript('C:\\Media\\2025', 'open');
    expect(script).toContain("$leaf = '2025'");
  });

  it('converts forward slashes to backslashes for the Explorer target', () => {
    const folder = buildWindowsRevealScript('C:/Media/2025', 'open');
    expect(folder).toContain("$target = 'C:\\Media\\2025'");
    expect(folder).toContain("$leaf = '2025'");
    const file = buildWindowsRevealScript('C:/Media/2025/a.jpg', 'select');
    expect(file).toContain("$target = 'C:\\Media\\2025\\a.jpg'");
    expect(file).toContain("$leaf = '2025'");
  });

  it('does not use verbatim arguments', () => {
    expect(detachedSpawnOptions({ command: 'explorer', args: ['x'] }).windowsVerbatimArguments).toBe(false);
  });

  it('builds open commands per platform', () => {
    expect(buildOpenCommand('win32', 'C:\\a&b.jpg')).toEqual({ command: 'explorer', args: ['C:\\a&b.jpg'] });
    expect(buildOpenCommand('darwin', '/a.jpg')).toEqual({ command: 'open', args: ['/a.jpg'] });
    expect(buildOpenCommand('linux', '/a.jpg')).toEqual({ command: 'xdg-open', args: ['/a.jpg'] });
    expect(buildOpenCommand('freebsd', '/a.jpg')).toBeNull();
  });

  it('builds folder picker commands per platform', () => {
    const windows = buildFolderPickerCommand('win32');
    expect(windows?.command).toBe('powershell');
    expect(windows?.args.join(' ')).toContain('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;');
    expect(buildFolderPickerCommand('darwin')).toEqual({
      command: 'osascript',
      args: ['-e', 'POSIX path of (choose folder)'],
    });
    expect(buildFolderPickerCommand('linux')).toEqual({
      command: 'zenity',
      args: ['--file-selection', '--directory'],
    });
    expect(buildFolderPickerCommand('freebsd')).toBeNull();
  });
});

describe('createNativeActions reveal and open', () => {
  it('returns not-found for an unknown id', async () => {
    const actions = createNativeActions(makeDeps({ getEntryPath: () => null }));
    expect(await actions.reveal(99)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('returns missing when the file is absent', async () => {
    const actions = createNativeActions(makeDeps({ fileExists: () => false }));
    expect(await actions.reveal(1)).toEqual({ ok: false, reason: 'missing' });
  });

  it('reveals a present file', async () => {
    const deps = makeDeps();
    const actions = createNativeActions(deps);
    expect(await actions.reveal(1)).toEqual({ ok: true });
    expect(deps.spawned[0].command).toBe('powershell');
    expect(deps.spawned[0].args[1]).toBe('-EncodedCommand');
  });

  it('opens a present file', async () => {
    const deps = makeDeps();
    const actions = createNativeActions(deps);
    expect(await actions.open(1)).toEqual({ ok: true });
    expect(deps.spawned).toEqual([{ command: 'explorer', args: ['C:/Media/2025/a.jpg'] }]);
  });

  it('maps fixture paths before the existence check', async () => {
    const fileExists = vi.fn(() => true);
    const actions = createNativeActions(makeDeps({ getEntryPath: () => '@fixtures/Media/2025/a.jpg', fileExists }));
    await actions.reveal(1);
    expect(fileExists).toHaveBeenCalledWith(expect.stringContaining('.fixtures'));
  });

  it('returns unsupported on an unknown platform', async () => {
    const actions = createNativeActions(makeDeps({ platform: 'freebsd' }));
    expect(await actions.reveal(1)).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('createNativeActions revealFolder', () => {
  it('rejects a folder outside the configured roots', async () => {
    const deps = makeDeps();
    const actions = createNativeActions(deps);
    expect(await actions.revealFolder('C:/Elsewhere')).toEqual({ ok: false, reason: 'not-found' });
    expect(deps.spawned).toEqual([]);
  });

  it('rejects a path traversing outside the configured roots', async () => {
    const deps = makeDeps();
    const actions = createNativeActions(deps);
    expect(await actions.revealFolder('C:/Media/../Elsewhere')).toEqual({ ok: false, reason: 'not-found' });
    expect(deps.spawned).toEqual([]);
  });

  it('returns missing when the folder is absent', async () => {
    const actions = createNativeActions(makeDeps({ fileExists: () => false }));
    expect(await actions.revealFolder('C:/Media')).toEqual({ ok: false, reason: 'missing' });
  });

  it('reveals a configured folder', async () => {
    const deps = makeDeps();
    const actions = createNativeActions(deps);
    expect(await actions.revealFolder('C:/Media/2025')).toEqual({ ok: true });
    expect(deps.spawned[0].command).toBe('powershell');
  });

  it('returns unsupported on an unknown platform', async () => {
    const actions = createNativeActions(makeDeps({ platform: 'freebsd' }));
    expect(await actions.revealFolder('C:/Media')).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('createNativeActions pickDirectory', () => {
  const picked: RunCaptureResult = {
    code: 0,
    stdout: 'C:/Media/Picked/\n',
    stderr: '',
    spawnFailed: false,
    timedOut: false,
  };

  it('returns the picked path without a trailing separator', async () => {
    const actions = createNativeActions(makeDeps({ runAndCapture: vi.fn(async () => picked) }));
    expect(await actions.pickDirectory()).toEqual({ status: 'picked', path: 'C:/Media/Picked' });
  });

  it('returns canceled for empty output', async () => {
    const actions = createNativeActions(makeDeps({ runAndCapture: vi.fn(async () => ({ ...picked, stdout: '' })) }));
    expect(await actions.pickDirectory()).toEqual({ status: 'canceled' });
  });

  it('returns timeout when the dialog times out', async () => {
    const actions = createNativeActions(
      makeDeps({ runAndCapture: vi.fn(async () => ({ ...picked, stdout: '', timedOut: true })) }),
    );
    expect(await actions.pickDirectory()).toEqual({ status: 'timeout' });
  });

  it('returns unsupported when the picker cannot start', async () => {
    const actions = createNativeActions(
      makeDeps({ runAndCapture: vi.fn(async () => ({ ...picked, stdout: '', spawnFailed: true })) }),
    );
    expect(await actions.pickDirectory()).toEqual({ status: 'unsupported' });
  });

  it('falls back to kdialog on Linux', async () => {
    const runAndCapture = vi
      .fn<(command: NativeCommand, timeoutMs: number) => Promise<RunCaptureResult>>()
      .mockResolvedValueOnce({ ...picked, stdout: '', spawnFailed: true })
      .mockResolvedValueOnce({ ...picked, stdout: '/home/user/pics' });
    const actions = createNativeActions(makeDeps({ platform: 'linux', runAndCapture }));
    expect(await actions.pickDirectory()).toEqual({ status: 'picked', path: '/home/user/pics' });
    expect(runAndCapture).toHaveBeenNthCalledWith(2, { command: 'kdialog', args: ['--getexistingdirectory'] }, 300000);
  });

  it('returns busy while a dialog is open', async () => {
    let resolveCapture!: (result: RunCaptureResult) => void;
    const runAndCapture = vi.fn(() => new Promise<RunCaptureResult>((resolve) => (resolveCapture = resolve)));
    const actions = createNativeActions(makeDeps({ runAndCapture }));
    const first = actions.pickDirectory();
    expect(await actions.pickDirectory()).toEqual({ status: 'busy' });
    resolveCapture(picked);
    expect(await first).toEqual({ status: 'picked', path: 'C:/Media/Picked' });
  });

  it('returns error when the picker throws', async () => {
    const runAndCapture = vi.fn(async (): Promise<RunCaptureResult> => {
      throw new Error('picker failed');
    });
    const actions = createNativeActions(makeDeps({ runAndCapture }));
    expect(await actions.pickDirectory()).toEqual({ status: 'error' });
  });
});
