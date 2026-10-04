import '@tanstack/react-start/server-only';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FolderPickResult, NativeActionResult } from '../../app/lib/types';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import { appConfigStore } from './app-config';
import { virtualToReal } from './db-path';
import { getEntryPathById } from './queries';

export type Platform = string;
export type NativeCommand = { command: string; args: string[]; verbatim?: boolean };

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
  getConfiguredRoots: () => string[];
  spawnDetached: (command: NativeCommand) => void;
  runAndCapture: (command: NativeCommand, timeoutMs: number) => Promise<RunCaptureResult>;
};

export type NativeActions = {
  reveal: (id: number) => Promise<NativeActionResult>;
  open: (id: number) => Promise<NativeActionResult>;
  revealFolder: (path: string) => Promise<NativeActionResult>;
  pickDirectory: () => Promise<FolderPickResult>;
};

const PICKER_TIMEOUT_MS = 300000;

const WINDOWS_FOLDER_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;',
  'Add-Type -AssemblyName System.Windows.Forms;',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
  "$dialog.Description = 'Select a folder';",
  'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }',
].join(' ');

function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function pathSegments(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean);
}

function leafName(path: string): string {
  const segments = pathSegments(path);
  return segments[segments.length - 1] ?? '';
}

function parentLeafName(path: string): string {
  const segments = pathSegments(path);
  return segments[segments.length - 2] ?? '';
}

export function buildWindowsRevealScript(targetPath: string, mode: 'select' | 'open'): string {
  const windowsPath = targetPath.replace(/\//g, '\\');
  const literal = windowsPath.replace(/'/g, "''");
  const leaf = mode === 'select' ? parentLeafName(targetPath) : leafName(targetPath);
  const leafLiteral = leaf.replace(/'/g, "''");
  return `
$ErrorActionPreference = 'SilentlyContinue'
$target = '${literal}'
$leaf = '${leafLiteral}'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class ImgSorterReveal {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static IntPtr Find(string leaf) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var cls = new StringBuilder(256);
      GetClassName(h, cls, 256);
      if (cls.ToString() != "CabinetWClass") return true;
      var title = new StringBuilder(512);
      GetWindowText(h, title, 512);
      if (title.ToString().Contains(leaf)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static void Force(IntPtr h) {
    uint p1, p2;
    var fg = GetForegroundWindow();
    uint t1 = GetWindowThreadProcessId(fg, out p1);
    uint t2 = GetWindowThreadProcessId(h, out p2);
    AttachThreadInput(t1, t2, true);
    ShowWindow(h, 9);
    SetForegroundWindow(h);
    AttachThreadInput(t1, t2, false);
  }
}
"@
if ('${mode}' -eq 'select') { Start-Process explorer -ArgumentList ('/select,"' + $target + '"') } else { Start-Process explorer -ArgumentList ('"' + $target + '"') }
Start-Sleep -Milliseconds 900
$h = [ImgSorterReveal]::Find($leaf)
if ($h -ne [IntPtr]::Zero) { [ImgSorterReveal]::Force($h) }
`;
}

export function buildRevealCommand(platform: Platform, filePath: string): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return {
        command: 'powershell',
        args: ['-NoProfile', '-EncodedCommand', encodePowerShell(buildWindowsRevealScript(filePath, 'select'))],
      };
    case 'darwin':
      return { command: 'open', args: ['-R', filePath] };
    case 'linux':
      return { command: 'xdg-open', args: [dirname(filePath)] };
    default:
      return null;
  }
}

export function buildRevealFolderCommand(platform: Platform, folderPath: string): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return {
        command: 'powershell',
        args: ['-NoProfile', '-EncodedCommand', encodePowerShell(buildWindowsRevealScript(folderPath, 'open'))],
      };
    case 'darwin':
      return { command: 'open', args: [folderPath] };
    case 'linux':
      return { command: 'xdg-open', args: [folderPath] };
    default:
      return null;
  }
}

export function buildOpenCommand(platform: Platform, filePath: string): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return { command: 'explorer', args: [filePath] };
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

export function detachedSpawnOptions(command: NativeCommand): {
  windowsHide: boolean;
  detached: boolean;
  windowsVerbatimArguments: boolean;
} {
  return { windowsHide: true, detached: true, windowsVerbatimArguments: command.verbatim === true };
}

function defaultSpawnDetached(command: NativeCommand): void {
  const child = spawn(command.command, command.args, detachedSpawnOptions(command));
  child.on('error', () => {});
  child.unref();
}

function defaultRunAndCapture(command: NativeCommand, timeoutMs: number): Promise<RunCaptureResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const child = spawn(command.command, command.args, { windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (code: number | null, spawnFailed: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        spawnFailed,
        timedOut,
      });
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on('error', () => finish(null, true));
    child.on('close', (code) => finish(code, false));
  });
}

function defaultDeps(): NativeActionDeps {
  return {
    platform: process.platform,
    fileExists: (path) => existsSync(path),
    getEntryPath: (id) => getEntryPathById(id),
    getConfiguredRoots: () =>
      appConfigStore
        .get()
        .directories.indexed.filter((entry) => entry.enabled)
        .map((entry) => entry.path),
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

  const isWithinRoots = (path: string): boolean => {
    const normalized = normalizeDirectoryPath(path);
    if (normalized.split('/').some((segment) => segment === '..')) return false;
    const target = normalized.toLowerCase();
    return deps.getConfiguredRoots().some((root) => {
      const scope = normalizeDirectoryPath(root).toLowerCase();
      return target === scope || target.startsWith(`${scope}/`);
    });
  };

  const revealFolder = async (path: string): Promise<NativeActionResult> => {
    try {
      if (!isWithinRoots(path)) return { ok: false, reason: 'not-found' };
      const realPath = path.startsWith('@fixtures') ? virtualToReal(path) : path;
      if (!deps.fileExists(realPath)) return { ok: false, reason: 'missing' };
      const command = buildRevealFolderCommand(deps.platform, realPath);
      if (!command) return { ok: false, reason: 'unsupported' };
      deps.spawnDetached(command);
      return { ok: true };
    } catch (error) {
      console.error('Reveal folder failed', error);
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
    revealFolder,
    pickDirectory,
  };
}

export const nativeActions = createNativeActions();
