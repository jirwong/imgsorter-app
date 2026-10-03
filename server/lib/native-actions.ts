import '@tanstack/react-start/server-only';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FolderPickResult, NativeActionResult } from '../../app/lib/types';
import { virtualToReal } from './db-path';
import { getEntryPathById } from './queries';

export type Platform = string;
export type NativeCommand = { command: string; args: string[] };

export type RunCaptureResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  spawnFailed: boolean;
  timedOut: boolean;
};

export type NativeActionDeps = {
  platform: Platform;
  fileExists: (path: string) => boolean;
  getEntryPath: (id: number) => string | null;
  spawnDetached: (command: NativeCommand) => void;
  runAndCapture: (command: NativeCommand, timeoutMs: number) => Promise<RunCaptureResult>;
};

export type NativeActions = {
  reveal: (id: number) => Promise<NativeActionResult>;
  open: (id: number) => Promise<NativeActionResult>;
  pickDirectory: () => Promise<FolderPickResult>;
};

const PICKER_TIMEOUT_MS = 300000;

const WINDOWS_FOLDER_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms;',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
  "$dialog.Description = 'Select a folder';",
  'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }',
].join(' ');

export function buildRevealCommand(platform: Platform, filePath: string): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return { command: 'explorer', args: [`/select,${filePath}`] };
    case 'darwin':
      return { command: 'open', args: ['-R', filePath] };
    case 'linux':
      return { command: 'xdg-open', args: [dirname(filePath)] };
    default:
      return null;
  }
}

export function buildOpenCommand(platform: Platform, filePath: string): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return { command: 'cmd', args: ['/c', 'start', '', filePath] };
    case 'darwin':
      return { command: 'open', args: [filePath] };
    case 'linux':
      return { command: 'xdg-open', args: [filePath] };
    default:
      return null;
  }
}

export function buildFolderPickerCommand(platform: Platform): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return { command: 'powershell', args: ['-STA', '-NoProfile', '-Command', WINDOWS_FOLDER_SCRIPT] };
    case 'darwin':
      return { command: 'osascript', args: ['-e', 'POSIX path of (choose folder)'] };
    case 'linux':
      return { command: 'zenity', args: ['--file-selection', '--directory'] };
    default:
      return null;
  }
}

function stripTrailingSeparator(path: string): string {
  if (path === '/' || /^[A-Za-z]:[\\/]$/.test(path)) return path;
  return path.replace(/[\\/]+$/, '');
}

function toPickResult(result: RunCaptureResult): FolderPickResult {
  if (result.timedOut) return { status: 'timeout' };
  if (result.spawnFailed) return { status: 'unsupported' };
  const path = result.stdout.trim();
  if (!path) return { status: 'canceled' };
  return { status: 'picked', path: stripTrailingSeparator(path) };
}

function defaultSpawnDetached(command: NativeCommand): void {
  const child = spawn(command.command, command.args, { windowsHide: true, detached: true });
  child.on('error', () => {});
  child.unref();
}

function defaultRunAndCapture(command: NativeCommand, timeoutMs: number): Promise<RunCaptureResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(command.command, command.args, { windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (result: RunCaptureResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', () => finish({ code: null, stdout, stderr, spawnFailed: true, timedOut: false }));
    child.on('close', (code) => finish({ code, stdout, stderr, spawnFailed: false, timedOut }));
  });
}

function defaultDeps(): NativeActionDeps {
  return {
    platform: process.platform,
    fileExists: (path) => existsSync(path),
    getEntryPath: (id) => getEntryPathById(id),
    spawnDetached: defaultSpawnDetached,
    runAndCapture: defaultRunAndCapture,
  };
}

export function createNativeActions(overrides: Partial<NativeActionDeps> = {}): NativeActions {
  const deps: NativeActionDeps = { ...defaultDeps(), ...overrides };
  let picking = false;

  const runAction = async (id: number, kind: 'reveal' | 'open'): Promise<NativeActionResult> => {
    try {
      const stored = deps.getEntryPath(id);
      if (!stored) return { ok: false, reason: 'not-found' };
      const realPath = stored.startsWith('@fixtures') ? virtualToReal(stored) : stored;
      if (!deps.fileExists(realPath)) return { ok: false, reason: 'missing' };
      const command =
        kind === 'reveal' ? buildRevealCommand(deps.platform, realPath) : buildOpenCommand(deps.platform, realPath);
      if (!command) return { ok: false, reason: 'unsupported' };
      deps.spawnDetached(command);
      return { ok: true };
    } catch (error) {
      console.error('Native action failed', error);
      return { ok: false, reason: 'error' };
    }
  };

  const pickDirectory = async (): Promise<FolderPickResult> => {
    if (picking) return { status: 'busy' };
    picking = true;
    try {
      const command = buildFolderPickerCommand(deps.platform);
      if (!command) return { status: 'unsupported' };
      const result = await deps.runAndCapture(command, PICKER_TIMEOUT_MS);
      if (deps.platform === 'linux' && result.spawnFailed) {
        return toPickResult(
          await deps.runAndCapture({ command: 'kdialog', args: ['--getexistingdirectory'] }, PICKER_TIMEOUT_MS),
        );
      }
      return toPickResult(result);
    } catch (error) {
      console.error('Folder picker failed', error);
      return { status: 'error' };
    } finally {
      picking = false;
    }
  };

  return {
    reveal: (id) => runAction(id, 'reveal'),
    open: (id) => runAction(id, 'open'),
    pickDirectory,
  };
}

export const nativeActions = createNativeActions();
