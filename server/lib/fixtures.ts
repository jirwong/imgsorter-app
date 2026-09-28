import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFixtureFiles, fixtureBytes } from './fixture-plan';
import { fixturesDir, virtualToReal } from './db-path';

function fixtureContent(name: string, size: number): Buffer {
  const seed = fixtureBytes(name);
  const content = Buffer.alloc(size);
  for (let offset = 0; offset < size; offset += seed.length) {
    seed.copy(content, offset);
  }
  return content;
}

export function writeFixtureTree(): void {
  rmSync(fixturesDir(), { recursive: true, force: true });
  for (const file of buildFixtureFiles()) {
    const dir = virtualToReal(file.root);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file.name), fixtureContent(file.name, file.size));
  }
}

export function removeFixtureTree(): void {
  rmSync(fixturesDir(), { recursive: true, force: true });
}
