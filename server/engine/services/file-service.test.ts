import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listFilePathsRecursive, listFilesRecursive } from './file-service';

function flipSeparators(path: string): string {
  return path.split(sep).join(sep === '\\' ? '/' : '\\');
}

async function makeTree() {
  const root = await mkdtemp(join(tmpdir(), 'imgsorter-ignore-'));
  const keep = join(root, 'keep');
  const skip = join(root, 'skip');
  await mkdir(keep, { recursive: true });
  await mkdir(join(skip, 'nested'), { recursive: true });
  await writeFile(join(keep, 'a.txt'), 'a');
  await writeFile(join(skip, 'b.txt'), 'b');
  await writeFile(join(skip, 'nested', 'c.txt'), 'c');
  return { root, skip };
}

describe('listFilesRecursive', () => {
  it('skips an ignored directory when the ignore path uses the other separator style', async () => {
    const { root, skip } = await makeTree();
    const files = await listFilesRecursive(root, ['.txt'], true, [flipSeparators(skip)]);
    expect(files.map((file) => file.filename).sort()).toEqual(['a.txt']);
  });
});

describe('listFilePathsRecursive', () => {
  it('skips an ignored directory when the ignore path uses the other separator style', async () => {
    const { root, skip } = await makeTree();
    const files = await listFilePathsRecursive(root, [flipSeparators(skip)]);
    expect(files.map((file) => basename(file)).sort()).toEqual(['a.txt']);
  });
});
