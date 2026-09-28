import { createHash } from 'node:crypto';

export const FIXTURE_ROOTS = [
  '@fixtures/Media/2025/Trips',
  '@fixtures/Media/2025/Library',
  '@fixtures/Media/2024',
  '@fixtures/Camera Imports',
] as const;

const SIZES = [1_200, 2_400, 4_800, 9_600, 19_200, 38_400, 76_800, 153_600];
const BASE_COUNTS: Record<string, number> = {
  '@fixtures/Media/2025/Trips': 200,
  '@fixtures/Media/2025/Library': 400,
  '@fixtures/Media/2024': 300,
  '@fixtures/Camera Imports': 300,
};
const DUPLICATE_SIZE = 6_400;

export type FixtureFile = {
  root: string;
  name: string;
  size: number;
};

function segment(root: string): string {
  return root.split('/').pop() ?? root;
}

export function fixtureBytes(name: string): Buffer {
  return Buffer.from(createHash('sha256').update(name).digest());
}

export function buildFixtureFiles(): FixtureFile[] {
  const files: FixtureFile[] = [];
  let n = 0;
  for (const root of FIXTURE_ROOTS) {
    const seg = segment(root);
    for (let i = 0; i < BASE_COUNTS[root]; i += 1) {
      const ext = n % 5 === 0 ? '.png' : n % 17 === 0 ? '.gif' : '.jpg';
      files.push({ root, name: `${seg}-${i + 1}${ext}`, size: SIZES[n % SIZES.length] });
      n += 1;
    }
  }
  let k = 0;
  for (const copies of [2, 3, 4]) {
    for (let g = 0; g < 8; g += 1) {
      const name = `duplicate-${k + 1}.jpg`;
      for (let r = 0; r < copies; r += 1) {
        files.push({ root: FIXTURE_ROOTS[r], name, size: DUPLICATE_SIZE });
      }
      k += 1;
    }
  }
  return files;
}

export function expectedFixtureStats(files: FixtureFile[] = buildFixtureFiles()) {
  const byName = new Map<string, FixtureFile[]>();
  for (const file of files) {
    const list = byName.get(file.name);
    if (list) list.push(file);
    else byName.set(file.name, [file]);
  }
  const duplicates = [...byName.values()].filter((list) => list.length > 1);
  return {
    totalFiles: files.length,
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
    uniqueFiles: [...byName.values()].filter((list) => list.length === 1).length,
    duplicateGroups: duplicates.length,
    redundantSpace: duplicates.reduce((sum, list) => sum + (list.length - 1) * list[0].size, 0),
  };
}
