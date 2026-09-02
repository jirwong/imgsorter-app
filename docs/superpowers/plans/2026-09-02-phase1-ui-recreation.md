# Phase 1 UI Recreation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the imgsorter-ui-v1 prototype UI in TanStack Start as a modularized, URL-routed app backed by in-memory mock data, with visual parity to the prototype.

**Architecture:** A single-page shell (`__root.tsx`) renders `Sidebar` + `AppHeader` + `<Outlet />` + `AppFooter` + a shared `FilePreviewDrawer`. Each nav view is a thin route file under `app/routes/` that mounts a feature page component under `app/features/<name>/`. Shared state lives in one lightweight `AppProvider` (React context): global filters (`query`, `dir`, `ext`), `selectedDirs` (Browse-only), `selectedFile`, `scanActive`, `logs`, `keepers`, plus a derived `filtered` memo. The three filterable routes (`/unique-files`, `/browse`, `/duplicates`) synchronize the global filters to/from TanStack Router search params. `mock-data.ts` mirrors the prototype's data exactly. No server, no engine, no persistence.

**Tech Stack:** TanStack Start (Vite, React 19, `@tanstack/react-start` + `@tanstack/react-router`), Mantine v9 core (`@mantine/core`, `@mantine/hooks`), lucide-react, Tailwind installed but unused, custom dark-cyan CSS tokens in `app/styles.css`. Tooling: pnpm, TypeScript 7 strict, oxlint, Vitest, Prettier, Lefthook.

**Source of truth:** Physical prototype at `C:\dev\repos\imgsorter-ui-v1\src\App.tsx` and `styles.css`. Copy markup/output strings verbatim. The spec is `docs/superpowers/specs/2026-09-02-phase1-ui-recreation-design.md`.

## Global Constraints

- Node >= 24, pnpm >= 11 (`packageManager: pnpm@11.20.0`).
- TypeScript strict; verbatim module syntax; named exports (no default exports except the `Route` objects TanStack requires). Follow the TanStack Start playground (`C:\dev\repos\tanstack-start-playground`) for Vite/router config, and `C:\dev\repos\basic-typescript-template` for tooling scripts/conventions.
- Prettier: 2-space indent, single quotes, semicolons, print width 120, trailing commas all.
- Commit messages follow Conventional Commits (e.g. `feat: add Overview feature`). Commit after each task; pre-push hook runs `pnpm check`.
- Every task implicitly satisfies: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` all pass. `vitest.config.ts` must keep `passWithNoTests: true`.
- Do NOT add comments to code. No `server/` directory. No engine, no `better-sqlite3`, no persistence, no file-system access.
- `birthtime` is `string`. `keepers` has no consequence (no delete/move). "3" badge and Activity progress are static. Duplicates nav badge label is literally `3`.
- The `filtered` memo pipeline is: `query` (matches filename or path, case-insensitive) AND `dir` (`'All directories'` or exact `directory` match) AND `ext` (`'All types'` or exact `extension`). Browse additionally requires OR of `selectedDirs`: `selectedDirs.length === 0 || selectedDirs.some(scope => e.directory === scope || e.directory.startsWith(scope + '/'))`.
- Global filters are URL-search-params ONLY on `/unique-files`, `/browse`, `/duplicates`. `selectedDirs` is a search param on `/browse` only. Non-filterable routes do not carry these params.
- Export/Metric card labels, timestamps, totals, and text copy must match the prototype byte-for-byte (see prototype source).
- KeepToggle renders only in Duplicates. `keepers` persists across navigation via context but is not surfaced on Files/Browse.
- Network thumbnails come from the 6 Unsplash URLs in `mock-data.ts`; drawer preview uses `thumbs[id % 6]`.

## Task 1: Scaffold TanStack Start project with tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `tsr.config.json`
- Create: `vitest.config.ts`
- Create: `.oxlintrc.json`
- Create: `prettier.config.mjs`
- Create: `.prettierignore`
- Create: `lefthook.yml`
- Create: `.nvmrc`, `.node-version`
- Create: `app/router.tsx`
- Create: `app/routes/__root.tsx`
- Create: `app/routes/index.tsx`
- Create: `app/styles.css`
- Modify: `.gitignore`

**Bootstrap note (important):** This repo set already contains a *working, running* TanStack Start app at `C:\dev\repos\tanstack-start-playground`. That installed version bootstraps **without** `index.html`, `app/main.tsx`, `client.tsx`, or `ssr.tsx` — the `@tanstack/react-start` Vite plugin generates the HTML entry and mounts the router from the exported `getRouter()` in `app/router.tsx` plus the full-`<html>` shell in `app/routes/__root.tsx` (`shellComponent`). Mirror that pattern exactly. Do NOT create an `index.html` or a `createRoot` entry — the plugin owns entry mounting. (Deviation from the spec's structure list, which assumed `app/main.tsx`; the running plugin takes precedence. The `app/` directory layout is kept per spec.)

**Interfaces:**
- Produces: a runnable TanStack Start app at `http://localhost:3000` with a single placeholder route; `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` all work. Routes live in `app/routes/`; `app/routeTree.gen.ts` is generated by `pnpm generate-routes`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "imgsorter-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.20.0",
  "scripts": {
    "prepare": "lefthook install",
    "dev": "vite dev --port 3000",
    "generate-routes": "tsr generate",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "oxlint app",
    "lint:fix": "oxlint --fix app",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm format:check"
  },
  "dependencies": {
    "@mantine/core": "^9.5.2",
    "@mantine/hooks": "^9.5.2",
    "@tanstack/react-router": "latest",
    "@tanstack/react-start": "latest",
    "lucide-react": "^1.16.0",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@tanstack/router-cli": "latest",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^26.2.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.1.1",
    "@vitest/coverage-v8": "^4.1.11",
    "jsdom": "^27.0.0",
    "lefthook": "^2.1.10",
    "lint-staged": "^17.3.0",
    "oxlint": "^1.79.0",
    "prettier": "^3.9.6",
    "tailwindcss": "^4.3.3",
    "@tailwindcss/postcss": "^4.3.3",
    "typescript": "^7.0.2",
    "vite": "^8.2.2",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `pnpm install`
Expected: installs; `prepare` runs `lefthook install` automatically (pnpm runs `prepare` after install). If hooks don't install, run `pnpm prepare`.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "include": ["**/*.ts", "**/*.tsx"],
  "compilerOptions": {
    "target": "ES2022",
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vitest/globals"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
})
```

Note: Tailwind packages are installed (spec constraint: "installed but unused") but neither a plugin nor PostCSS config wires them up, so they no-op — matching the prototype, which imports only Mantine styles.

- [ ] **Step 5: Create `tsr.config.json`**

```json
{
  "target": "react",
  "routesDirectory": "./app/routes",
  "routerFileId": "./app/router.tsx"
}
```

Note: `routesDirectory`/`routerFileId` keep the layout at `app/` (per spec) on the installed plugin version, matching the user's `tanstack-start-playground` (which uses `src/` only by coincidence of its template). If `pnpm generate-routes` works without them, they are harmless; keep them for explicitness.

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
  },
})
```

- [ ] **Step 7: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 8: Create `.oxlintrc.json`**

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "rules": {
    "correctness": "error",
    "perf": "error"
  }
}
```

- [ ] **Step 9: Create `prettier.config.mjs`**

```js
/** @type {import('prettier').Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 120,
  overrides: [
    {
      files: 'package.json',
      options: { tabWidth: 2 },
    },
  ],
}
```

- [ ] **Step 10: Create `.prettierignore`**

```
pnpm-lock.yaml
dist
coverage
app/routeTree.gen.ts
```

- [ ] **Step 11: Create `lefthook.yml`**

```yml
pre-commit:
  commands:
    lint-staged:
      run: pnpm exec lint-staged
pre-push:
  commands:
    check:
      run: pnpm check
```

- [ ] **Step 12: Create `.nvmrc` and `.node-version`**

Both files, content: `24`

- [ ] **Step 13: Update `.gitignore`**

Replace with:

```
node_modules
dist
coverage
.tanstack
*.local
.env
.env.*
!.env.example
```

- [ ] **Step 14: Create `app/router.tsx`**

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

Note: `getRouter` (not a constant `router`) is the export the `@tanstack/react-start` plugin requires, matching the running playground. `main.tsx`/`index.html`/`RouterProvider` are intentionally absent.

- [ ] **Step 15: Create `app/routes/__root.tsx` (minimal placeholder shell for Task 1)**

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'imgsorter' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app">{children}</div>
        <Scripts />
      </body>
    </html>
  )
}
```

Note: `shellComponent` renders the full `<html>` document; the plugin injects `{children}` (the routed page). The real shell (`AppProvider` + Sidebar + header/footer) lands in Task 4; the `MantineProvider` + theme lands in Task 13.

- [ ] **Step 16: Create `app/routes/index.tsx` (placeholder)**

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: IndexComponent,
})

function IndexComponent() {
  return <main>Placeholder — Overview lands here in Task 6.</main>
}
```

- [ ] **Step 17: Create `app/styles.css` (minimal for Task 1)**

```css
@import '@mantine/core/styles.css';
```

Note: this mirrors the prototype's first line. Tailwind is installed but unused — the `@tailwindcss/postcss` plugin no-ops when no `@import "tailwindcss"` / tailwind directives exist, honoring the constraint. Component/theme rules land in Tasks 4–13 (each task appends its section).

- [ ] **Step 18: Generate routes and confirm the router file is detected**

Run: `pnpm generate-routes`
Expected: creates `app/routeTree.gen.ts` importing from `./routes/__root`.

If the CLI reports "no routes found", run with explicit paths for this repo layout:

```bash
pnpm tsr generate --routes-directory ./app/routes --router-file ./app/router.tsx
```

(corresponds to `tsr.config.json` keys `routesDirectory` / `routerFileId` — see Step 5 if this persists).

- [ ] **Step 19: Run the full check**

Run: `pnpm check`
Expected: all four phases pass (typecheck, lint, test with 0 tests, format check). `vite build` must also succeed: run `pnpm build`. If typecheck fails on unused vars in route files, fix by removing them.

- [ ] **Step 20: Verify dev server boots**

Run: `pnpm dev`
Expected: `http://localhost:3000/` renders "Placeholder — Overview lands here in Task 6." with a working document (title `imgsorter`). No console errors about a missing client entry or route tree.

- [ ] **Step 21: Commit**

```bash
git add -A
git commit -m "chore: scaffold TanStack Start app with template tooling"
```

## Task 2: Shared lib — types, formatter, mock data

**Files:**
- Create: `app/lib/types.ts`
- Create: `app/lib/format.ts`
- Create: `app/lib/format.test.ts`
- Create: `app/lib/mock-data.ts`
- Create: `app/lib/mock-data.test.ts`

**Interfaces:**
- Produces (consumed by every later task):
  - `export type Entry = { id: number; size: number; directory: string; extension: string; filename: string; birthtime: string; hash: string | null; path: string }`
  - `export type DirectoryNode = { label: string; path: string; children?: DirectoryNode[] }`
  - `export type DuplicateGroup = { hash: string; name: string; count: number; space: string; files: Entry[] }`
  - `export type LogStatus = 'Complete' | 'Warning' | 'Running'`
  - `export type LogEntry = { time: string; event: string; directory: string; status: LogStatus }`
  - `export function formatBytes(n: number): string` — returns `'1.2 GB'` for `n >= 1e9` else `'44.2 MB'` style (`(n / 1e6).toFixed(1) + ' MB'`).
  - `export type { DirectoryNode as TreeNode }` is NOT defined; use `DirectoryNode`.
  - `export const thumbs: string[]` (6 Unsplash URLs)
  - `export const entries: Entry[]` (18 items, exact prototype values)
  - `export const groups: DuplicateGroup[]` (3 groups, referencing entries by slice)
  - `export const directoryTree: DirectoryNode[]` (3 roots)
  - `export const initialLogs: LogEntry[]` (3 entries)
  - `export const metricRows: [string, string, string][]` (6 Overview metrics)
  - `export const storageRows: [string, number, string][]` (3 Storage Map rows)
  - `export const runSteps: [string, string][]` (4 Last Run steps `['name','time']`)
  - `export const largestFiles: Entry[]` — `entries.slice(0, 4)`
  - `export const headerDirOptions: string[]` = `['C:/Media/2025', 'C:/Media/2024', 'D:/Camera Imports']`
  - `export const headerExtOptions: string[]` = `['.jpg', '.png']`
  - `export const preferences: { indexed: Array<{ path: string; enabled: boolean; lastScan: string; files: string }>; ignored: string[]; databaseName: string; extensions: string }` with prototype defaults.

- [ ] **Step 1: Write failing test for `format.ts`**

`app/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatBytes } from './format'

describe('formatBytes', () => {
  it('formats gigabytes with one decimal', () => {
    expect(formatBytes(2_400_000_000)).toBe('2.4 GB')
  })

  it('formats megabytes with one decimal', () => {
    expect(formatBytes(44_200_000)).toBe('44.2 MB')
  })

  it('formats small values as MB', () => {
    expect(formatBytes(9_700_000)).toBe('9.7 MB')
  })
})
```

- [ ] **Step 2: Run the test and see it fail**

Run: `pnpm test`
Expected: FAIL, `format.ts` does not exist / `formatBytes` not exported.

- [ ] **Step 3: Create `app/lib/types.ts`**

```ts
export type Entry = {
  id: number
  size: number
  directory: string
  extension: string
  filename: string
  birthtime: string
  hash: string | null
  path: string
}

export type DirectoryNode = {
  label: string
  path: string
  children?: DirectoryNode[]
}

export type DuplicateGroup = {
  hash: string
  name: string
  count: number
  space: string
  files: Entry[]
}

export type LogStatus = 'Complete' | 'Warning' | 'Running'

export type LogEntry = {
  time: string
  event: string
  directory: string
  status: LogStatus
}
```

- [ ] **Step 4: Create `app/lib/format.ts`**

```ts
export function formatBytes(n: number): string {
  return n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${(n / 1e6).toFixed(1)} MB`
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `pnpm test`
Expected: PASS (3 tests).

- [ ] **Step 6: Write failing shape tests for `mock-data.ts`**

`app/lib/mock-data.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { directoryTree, entries, groups, initialLogs, thumbs } from './mock-data'
import type { DirectoryNode, DuplicateGroup, Entry } from './types'

function isEntry(e: Entry): boolean {
  return (
    typeof e.id === 'number' &&
    typeof e.size === 'number' &&
    typeof e.directory === 'string' &&
    typeof e.extension === 'string' &&
    typeof e.filename === 'string' &&
    typeof e.birthtime === 'string' &&
    (e.hash === null || typeof e.hash === 'string') &&
    typeof e.path === 'string'
  )
}

function isDirectoryNode(n: DirectoryNode): boolean {
  return typeof n.label === 'string' && typeof n.path === 'string'
}

function isDuplicateGroup(g: DuplicateGroup): boolean {
  return (
    typeof g.hash === 'string' &&
    typeof g.name === 'string' &&
    typeof g.count === 'number' &&
    typeof g.space === 'string' &&
    Array.isArray(g.files) &&
    g.files.every(isEntry)
  )
}

describe('mock-data', () => {
  it('has 18 valid entries', () => {
    expect(entries).toHaveLength(18)
    expect(entries.every(isEntry)).toBe(true)
  })

  it('entries keep the prototype id sequence', () => {
    expect(entries[0].id).toBe(1)
    expect(entries[17].id).toBe(18)
  })

  it('has 3 valid duplicate groups whose files are entries', () => {
    expect(groups).toHaveLength(3)
    expect(groups.every(isDuplicateGroup)).toBe(true)
    expect(groups[0].files).toEqual(entries.slice(0, 5))
  })

  it('has a valid 3-root directory tree', () => {
    expect(directoryTree).toHaveLength(3)
    expect(directoryTree.every(isDirectoryNode)).toBe(true)
    expect(directoryTree[0].label).toBe('Media (C:)')
  })

  it('has 6 thumbnails and 3 initial logs', () => {
    expect(thumbs).toHaveLength(6)
    expect(initialLogs).toHaveLength(3)
  })
})
```

- [ ] **Step 7: Run the test and see it fail**

Run: `pnpm test`
Expected: FAIL, `mock-data.ts` does not exist.

- [ ] **Step 8: Create `app/lib/mock-data.ts`**

```ts
import type { DirectoryNode, DuplicateGroup, Entry, LogEntry } from './types'

export const thumbs = [
  'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=200&q=70',
  'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=200&q=70',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&q=70',
  'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=200&q=70',
  'https://images.unsplash.com/photo-1511497584788-876760111969?w=200&q=70',
  'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=200&q=70',
]

export const entries: Entry[] = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  size: [28400000, 18400000, 9700000, 7600000, 5400000][i % 5],
  directory:
    i === 1
      ? 'C:/Media/2025/Trips/2025-Summer-Family-Vacation-Originals'
      : ['C:/Media/2025', 'C:/Media/2024', 'D:/Camera Imports'][i % 3],
  extension: i % 4 === 0 ? '.png' : '.jpg',
  filename:
    i === 1
      ? 'shoreline-sunset-with-family-at-the-lake-final-edited-copy.jpg'
      : ['mountain-lake', 'shoreline', 'forest-trail', 'sunset', 'family-trip', 'coastline'][i % 6] + `-${i + 1}.jpg`,
  birthtime: `2025-0${(i % 8) + 1}-1${i % 9}T10:24:00Z`,
  hash: i % 5 === 0 ? null : `sha256-${['a1f9', 'b82c', 'c31e', 'd94a'][i % 4]}`,
  path: `C:/Media/2025/${i % 2 ? 'Trips' : 'Library'}/file-${i + 1}.jpg`,
}))

export const groups: DuplicateGroup[] = [
  { hash: 'sha256-a1f9', name: 'mountain-lake.jpg', count: 5, space: '112.8 MB', files: entries.slice(0, 5) },
  { hash: 'sha256-b82c', name: 'shoreline.jpg', count: 3, space: '44.2 MB', files: entries.slice(5, 8) },
  { hash: 'sha256-c31e', name: 'forest-trail.jpg', count: 2, space: '9.7 MB', files: entries.slice(8, 10) },
]

export const directoryTree: DirectoryNode[] = [
  {
    label: 'Media (C:)',
    path: 'C:/Media',
    children: [
      { label: '2025', path: 'C:/Media/2025', children: [{ label: 'Trips', path: 'C:/Media/2025/Trips' }] },
      { label: '2024', path: 'C:/Media/2024' },
    ],
  },
  { label: 'Camera Imports (D:)', path: 'D:/Camera Imports' },
  { label: 'Archive (Z:)', path: 'Z:/Archive' },
]

export const initialLogs: LogEntry[] = [
  { time: '09:42:18', event: 'Scan completed', directory: 'C:/Media/2025', status: 'Complete' },
  { time: '09:42:04', event: 'Permission denied', directory: 'C:/Media/2025/Private', status: 'Warning' },
  { time: '09:40:12', event: 'Files indexed', directory: 'D:/Camera Imports', status: 'Complete' },
]

export const headerDirOptions: string[] = ['C:/Media/2025', 'C:/Media/2024', 'D:/Camera Imports']
export const headerExtOptions: string[] = ['.jpg', '.png']

export const metricRows: [string, string, string][] = [
  ['Total files', '18,426', '+12%'],
  ['Total size', '2.4 GB', ''],
  ['Duplicate groups', '3', ''],
  ['Redundant space', '166.7 MB', '-8%'],
  ['Unique files', '11,208', ''],
  ['Not backed up', '2,184', 'attention'],
]

export const storageRows: [string, number, string][] = [
  ['C:/Media/2025', 52, '1.2 GB'],
  ['C:/Media/2024', 31, '740 MB'],
  ['D:/Camera Imports', 17, '460 MB'],
]

export const runSteps: [string, string][] = [
  ['Index files', '1.2s'],
  ['Calculate hashes', '2.2s'],
  ['Rebuild records', '3.2s'],
  ['Check backup coverage', '4.2s'],
]

export const largestFiles: Entry[] = entries.slice(0, 4)

export const preferences = {
  indexed: [
    { path: 'C:/Media/2025', enabled: true, lastScan: 'Today, 09:42', files: '12,842' },
    { path: 'D:/Camera Imports', enabled: true, lastScan: 'Today, 09:40', files: '5,584' },
  ],
  ignored: ['C:/Media/2025/Cache', 'C:/Media/2024/Exports'],
  databaseName: 'local.db',
  extensions: 'jpg, png, gif, jpeg, mp4, mov',
}
```

- [ ] **Step 9: Run the test and see it pass**

Run: `pnpm test`
Expected: PASS (all shape tests).

- [ ] **Step 10: Run full check**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add app/lib
git commit -m "feat: add shared types, byte formatter, and mock data"
```

## Task 3: AppProvider context with global filters and filtered memo

**Files:**
- Create: `app/lib/app-context.tsx`
- Create: `app/lib/filter-pipeline.ts`
- Create: `app/lib/filter-pipeline.test.ts`

**Interfaces:**
- Consumes: `Entry` from `app/lib/types`, `entries` from `app/lib/mock-data`, `LogEntry` from `app/lib/types`.
- Produces:
  - `export function applyFilters(input: Entry[], query: string, dir: string, ext: string, selectedDirs: string[]): Entry[]` — pure, exported from `filter-pipeline.ts`.
  - `export type GlobalFilters = { query: string; dir: string; ext: string; selectedDirs: string[] }`
  - `export type AppContextValue = { query: string; setQuery: (v: string) => void; dir: string; setDir: (v: string) => void; ext: string; setExt: (v: string) => void; selectedDirs: string[]; setSelectedDirs: (dirs: string[]) => void; toggleSelectedDir: (path: string) => void; clearSelectedDirs: () => void; filtered: Entry[]; selectedFile: Entry | null; setSelectedFile: (e: Entry | null) => void; scanActive: boolean; logs: LogEntry[]; startScan: () => void; keepers: number[]; toggleKeeper: (id: number) => void; setKeepers: (ids: number[]) => void }`
  - `export function AppProvider({ children }: { children: React.ReactNode }): React.ReactElement`
  - `export function useApp(): AppContextValue` — throws if used outside provider.

- [ ] **Step 1: Write failing test for `filter-pipeline.ts`**

`app/lib/filter-pipeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyFilters } from './filter-pipeline'
import type { Entry } from './types'

const e = (over: Partial<Entry>): Entry => ({
  id: 1,
  size: 100,
  directory: 'C:/Media/2025',
  extension: '.jpg',
  filename: 'photo.jpg',
  birthtime: '2025-01-01T10:24:00Z',
  hash: null,
  path: 'C:/Media/2025/Library/file.jpg',
  ...over,
})

describe('applyFilters', () => {
  const all = [
    e({ id: 1, filename: 'sunset.jpg', path: 'C:/Media/2025/Library/a.jpg', directory: 'C:/Media/2025', extension: '.jpg' }),
    e({ id: 2, filename: 'lake.png', path: 'C:/Media/2024/Library/b.png', directory: 'C:/Media/2024', extension: '.png' }),
    e({ id: 3, filename: 'trail.jpg', path: 'D:/Camera Imports/Library/c.jpg', directory: 'D:/Camera Imports', extension: '.jpg' }),
  ]

  it('matches query against filename or path, case-insensitive', () => {
    expect(applyFilters(all, 'SUNSET', 'All directories', 'All types', [])).toEqual([all[0]])
    expect(applyFilters(all, 'library/c', 'All directories', 'All types', [])).toEqual([all[2]])
  })

  it('filters by exact directory', () => {
    expect(applyFilters(all, '', 'C:/Media/2024', 'All types', [])).toEqual([all[1]])
  })

  it('filters by exact extension', () => {
    expect(applyFilters(all, '', 'All directories', '.png', [])).toEqual([all[1]])
  })

  it('applies selectedDirs as OR-prefix scope', () => {
    expect(applyFilters(all, '', 'All directories', 'All types', ['C:/Media'])).toEqual([all[0], all[1]])
    expect(applyFilters(all, '', 'All directories', 'All types', ['C:/Media/2025/Sub'])).toEqual([])
  })

  it('returns all when every filter is at default', () => {
    expect(applyFilters(all, '', 'All directories', 'All types', [])).toEqual(all)
  })
})
```

- [ ] **Step 2: Run the test and see it fail**

Run: `pnpm test`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `app/lib/filter-pipeline.ts`**

```ts
import type { Entry } from './types'

export type GlobalFilters = {
  query: string
  dir: string
  ext: string
  selectedDirs: string[]
}

export function applyFilters(
  input: Entry[],
  query: string,
  dir: string,
  ext: string,
  selectedDirs: string[],
): Entry[] {
  const q = query.trim().toLowerCase()
  return input.filter((entry) => {
    const matchesQuery =
      !q || entry.filename.toLowerCase().includes(q) || entry.path.toLowerCase().includes(q)
    const matchesDir = dir === 'All directories' || entry.directory === dir
    const matchesExt = ext === 'All types' || entry.extension === ext
    const matchesSelectedDirs =
      selectedDirs.length === 0 ||
      selectedDirs.some((scope) => entry.directory === scope || entry.directory.startsWith(`${scope}/`))
    return matchesQuery && matchesDir && matchesExt && matchesSelectedDirs
  })
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm test`
Expected: PASS (5 tests).

- [ ] **Step 5: Create `app/lib/app-context.tsx`**

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import type { Entry, LogEntry } from './types'
import { entries } from './mock-data'
import { applyFilters } from './filter-pipeline'

export type AppContextValue = {
  query: string
  setQuery: (v: string) => void
  dir: string
  setDir: (v: string) => void
  ext: string
  setExt: (v: string) => void
  selectedDirs: string[]
  setSelectedDirs: (dirs: string[]) => void
  toggleSelectedDir: (path: string) => void
  clearSelectedDirs: () => void
  filtered: Entry[]
  selectedFile: Entry | null
  setSelectedFile: (e: Entry | null) => void
  scanActive: boolean
  logs: LogEntry[]
  startScan: () => void
  keepers: number[]
  toggleKeeper: (id: number) => void
  setKeepers: (ids: number[]) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }): ReactElement {
  const [query, setQuery] = useState('')
  const [dir, setDir] = useState('All directories')
  const [ext, setExt] = useState('All types')
  const [selectedDirs, setSelectedDirs] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState<Entry | null>(null)
  const [scanActive, setScanActive] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: '09:42:18', event: 'Scan completed', directory: 'C:/Media/2025', status: 'Complete' },
    { time: '09:42:04', event: 'Permission denied', directory: 'C:/Media/2025/Private', status: 'Warning' },
    { time: '09:40:12', event: 'Files indexed', directory: 'D:/Camera Imports', status: 'Complete' },
  ])
  const [keepers, setKeepers] = useState<number[]>([])

  const filtered = useMemo(
    () => applyFilters(entries, query, dir, ext, selectedDirs),
    [query, dir, ext, selectedDirs],
  )

  const toggleSelectedDir = useCallback((path: string) => {
    setSelectedDirs((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path],
    )
  }, [])

  const clearSelectedDirs = useCallback(() => setSelectedDirs([]), [])

  const startScan = useCallback(() => {
    setScanActive(true)
    setLogs((current) => [
      { time: 'Now', event: 'Scan started', directory: 'Enabled directories', status: 'Running' },
      ...current,
    ])
  }, [])

  const toggleKeeper = useCallback((id: number) => {
    setKeepers((current) => (current.includes(id) ? current.filter((k) => k !== id) : [...current, id]))
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      query,
      setQuery,
      dir,
      setDir,
      ext,
      setExt,
      selectedDirs,
      setSelectedDirs,
      toggleSelectedDir,
      clearSelectedDirs,
      filtered,
      selectedFile,
      setSelectedFile,
      scanActive,
      logs,
      startScan,
      keepers,
      toggleKeeper,
      setKeepers,
    }),
    [query, dir, ext, selectedDirs, setSelectedDirs, toggleSelectedDir, clearSelectedDirs, filtered, selectedFile, scanActive, logs, startScan, keepers, toggleKeeper],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useApp must be used within <AppProvider>')
  }
  return ctx
}
```

- [ ] **Step 6: Run full check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/lib
git commit -m "feat: add app context provider and global filter pipeline"
```

## Task 4: App shell — Sidebar, AppHeader, AppFooter, root route, scan wiring

**Files:**
- Create: `app/components/common/Sidebar.tsx`
- Create: `app/components/common/AppHeader.tsx`
- Create: `app/components/common/AppFooter.tsx`
- Modify: `app/routes/__root.tsx`
- Modify: `app/routes/index.tsx`
- Modify: `app/styles.css` (shell + app-shell/header/footer/sidebar styles from prototype)

**Interfaces:**
- Consumes: `useApp` from `app/lib/app-context`; `formatBytes`, `headerDirOptions`, `headerExtOptions` from `app/lib/mock-data` (options) and `app/lib/format`.
- Produces:
  - `export function Sidebar(): ReactElement` — renders brand, Scan library button (calls `startScan()` then `router.navigate({ to: '/activity' })`), scan-state block (`INDEXING COMPLETE` / `100%` / `18,426 files · 2.4 GB`), nav of 6 items via `NavLink`, Duplicates badge `3`, and Preferences link pinned bottom.
  - `export function AppHeader(): ReactElement` — mobile title, global search `TextInput` (binds `query`), directory `Select` (binds `dir`), extension `Select` (binds `ext`), status dot + `Ready` text, Export button NOT here (export lives in the page title row — see Task 4 note).
  - `export function AppFooter(): ReactElement` — `18,426 files`, `2.4 GB indexed`, `Last scan 2 minutes ago · 4 warnings`.
  - The root route mounts `<Sidebar /><main>...<Outlet /></main><AppFooter />` inside `AppProvider`.

Note on the header vs. page-title row: in the prototype the `Export` button and the page `h1` live in a shared row above routed content, but each feature renders its own title. Decision: the `Sidebar`/`AppHeader`/`AppFooter` handle shell chrome; the `Export` button + `h1` row is rendered by each feature page's shared wrapper `PageHeading` created in Task 6. `AppHeader` therefore contains only search/dir/ext/status (nothing that requires per-page text).

- [ ] **Step 1: Create `app/components/common/Sidebar.tsx`**

```tsx
import { Badge, Button, Group, Progress, Text, ThemeIcon } from '@mantine/core'
import { Activity, Archive, BarChart3, FileImage, LayoutGrid, Settings2, Sparkles, Upload } from 'lucide-react'
import { NavLink, useRouter } from '@tanstack/react-router'
import { useApp } from '../../lib/app-context'

const navItems = [
  { label: 'Overview', to: '/', icon: BarChart3 },
  { label: 'Duplicates', to: '/duplicates', icon: Archive },
  { label: 'Unique Files', to: '/unique-files', icon: Sparkles },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { label: 'Browse', to: '/browse', icon: LayoutGrid },
  { label: 'Activity', to: '/activity', icon: Activity },
] as const

export function Sidebar() {
  const { startScan } = useApp()
  const router = useRouter()

  const handleScan = () => {
    startScan()
    router.navigate({ to: '/activity' })
  }

  return (
    <aside>
      <div className="brand">
        <ThemeIcon size={34} radius="md" color="cyan">
          <FileImage size={20} />
        </ThemeIcon>
        <div>
          <b>imgsorter</b>
          <small>v2 / local library</small>
        </div>
      </div>
      <Button leftSection={<Upload size={16} />} fullWidth color="cyan" className="scan" onClick={handleScan}>
        Scan library
      </Button>
      <div className="scan-state">
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            INDEXING COMPLETE
          </Text>
          <Text size="xs" c="cyan">
            100%
          </Text>
        </Group>
        <Progress value={100} color="cyan" size="xs" mt={7} />
        <Text size="xs" c="dimmed" mt={8}>
          18,426 files · 2.4 GB
        </Text>
      </div>
      <nav>
        {navItems.map(({ label, to, icon: Icon }) => (
          <NavLink key={label} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon size={17} />
            {label}
            {label === 'Duplicates' && (
              <Badge size="xs" color="orange">
                3
              </Badge>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/preferences" className={({ isActive }) => (isActive ? 'active' : '')}>
          <Settings2 size={16} />
          Preferences
        </NavLink>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create `app/components/common/AppHeader.tsx`**

```tsx
import { Select, Text, TextInput } from '@mantine/core'
import { Menu, Search } from 'lucide-react'
import { useRouterState } from '@tanstack/react-router'
import { useApp } from '../../lib/app-context'
import { headerDirOptions, headerExtOptions } from '../../lib/mock-data'

const viewTitles: Record<string, string> = {
  '/': 'Overview',
  '/duplicates': 'Duplicates',
  '/unique-files': 'Unique Files',
  '/analytics': 'Analytics',
  '/browse': 'Browse',
  '/activity': 'Activity',
  '/preferences': 'Preferences',
}

export function AppHeader() {
  const { query, setQuery, dir, setDir, ext, setExt } = useApp()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const title = viewTitles[pathname] ?? 'imgsorter'

  return (
    <header>
      <div className="mobile-title">
        <Menu size={18} />
        <b>{title}</b>
      </div>
      <TextInput
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        leftSection={<Search size={16} />}
        placeholder="Search files, paths, hashes..."
        className="search"
      />
      <Select value={dir} onChange={(value) => setDir(value ?? 'All directories')} data={['All directories', ...headerDirOptions]} />
      <Select value={ext} onChange={(value) => setExt(value ?? 'All types')} data={['All types', ...headerExtOptions]} />
      <div className="header-status">
        <span className="dot" />
        <Text size="xs">Ready</Text>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Create `app/components/common/AppFooter.tsx`**

```tsx
import { Group } from '@mantine/core'
import { Database, HardDrive } from 'lucide-react'

export function AppFooter() {
  return (
    <footer>
      <Group gap="lg">
        <span>
          <Database size={13} /> 18,426 files
        </span>
        <span>
          <HardDrive size={13} /> 2.4 GB indexed
        </span>
      </Group>
      <span>Last scan 2 minutes ago · 4 warnings</span>
    </footer>
  )
}
```

- [ ] **Step 4: Modify `app/routes/__root.tsx` to mount the shell**

Keep the `shellComponent` structure from Task 1 and wrap `{children}` in the app shell. The `children` prop is the routed page (TanStack Start injects it):

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AppProvider } from '../lib/app-context'
import { Sidebar } from '../components/common/Sidebar'
import { AppHeader } from '../components/common/AppHeader'
import { AppFooter } from '../components/common/AppFooter'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'imgsorter' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <AppProvider>
          <div className="app-shell">
            <Sidebar />
            <main>
              <AppHeader />
              <section className="content">
                {children}
              </section>
              <AppFooter />
            </main>
          </div>
        </AppProvider>
        <Scripts />
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Modify `app/routes/index.tsx` to a minimal Overview placeholder**

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: IndexComponent,
})

function IndexComponent() {
  return <main>Placeholder — Overview lands here in Task 6.</main>
}
```

- [ ] **Step 6: Add shell styles to `app/styles.css`**

Append the prototype's shell rules after the existing `@import '@mantine/core/styles.css';` line (units copied verbatim):

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #101318;
  color: #edf3f7;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  color-scheme: dark;
}

.app-shell {
  min-height: 100vh;
  display: flex;
  background: #101318;
}

aside {
  width: 238px;
  flex: none;
  border-right: 1px solid #2a323d;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  background: #12161c;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 8px 30px;
}

.brand b {
  font-size: 16px;
  letter-spacing: -0.02em;
}

.brand small {
  display: block;
  color: #8d98a8;
  font-size: 10px;
  margin-top: 2px;
}

.scan {
  height: 40px;
  font-weight: 600;
  box-shadow: 0 0 24px #18c7d822;
}

.scan-state {
  padding: 17px 8px 26px;
  border-bottom: 1px solid #2a323d;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 22px;
}

nav a {
  display: flex;
  gap: 11px;
  align-items: center;
  border: 0;
  color: #8d98a8;
  background: transparent;
  padding: 10px;
  border-radius: 7px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  text-decoration: none;
}

nav a:hover,
nav a.active {
  background: #202932;
  color: #edf3f7;
}

nav a.active {
  color: #18c7d8;
}

nav .mantine-Badge-root {
  margin-left: auto;
}

.sidebar-bottom {
  margin-top: auto;
  border-top: 1px solid #2a323d;
  padding-top: 14px;
}

.sidebar-bottom a {
  width: 100%;
  padding-left: 8px;
  display: flex;
  gap: 11px;
  align-items: center;
  color: #8d98a8;
  text-decoration: none;
  padding-top: 10px;
  padding-bottom: 10px;
}

.sidebar-bottom a:hover,
.sidebar-bottom a.active {
  background: #202932;
  color: #edf3f7;
}

.sidebar-bottom a.active {
  color: #18c7d8;
}

main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

header {
  height: 72px;
  border-bottom: 1px solid #2a323d;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 30px;
  background: #141920;
}

.search {
  flex: 1;
  max-width: 430px;
}

.header-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.dot {
  height: 7px;
  width: 7px;
  background: #59d390;
  border-radius: 50%;
  box-shadow: 0 0 8px #59d390;
}

.mobile-title {
  display: none;
}

.content {
  padding: 30px;
  max-width: 1450px;
  width: 100%;
  margin: 0 auto;
  flex: 1;
  overflow: auto;
}

footer {
  height: 42px;
  border-top: 1px solid #2a323d;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 30px;
  color: #8d98a8;
  font-size: 11px;
}

footer span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.eyebrow {
  color: #18c7d8;
  font-size: 10px !important;
  letter-spacing: 0.13em;
  font-weight: 700;
}

h1 {
  font-size: 30px;
  letter-spacing: -0.04em;
  margin: 3px 0 5px;
}

h2 {
  font-size: 17px;
  letter-spacing: -0.02em;
  margin: 4px 0;
}

.mantine-Card-root {
  background: #171b22;
  border-color: #2a323d;
}

@media (max-width: 900px) {
  aside {
    width: 190px;
  }
  header {
    padding: 0 18px;
  }
  .content {
    padding: 22px;
  }
}

@media (max-width: 650px) {
  aside {
    display: none;
  }
  .mobile-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .search {
    max-width: none;
  }
  header {
    gap: 8px;
  }
  header .mantine-Select-root {
    display: none;
  }
  .content {
    padding: 18px;
  }
  footer {
    padding: 0 15px;
  }
  footer span:last-child {
    display: none;
  }
}
```

- [ ] **Step 7: Add a smoke render test for the shell**

`app/components/common/app-shell.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { AppProvider } from '../../lib/app-context'
import { AppFooter } from './AppFooter'

describe('app shell', () => {
  it('renders footer totals', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <AppFooter />
        </AppProvider>
      </MantineProvider>,
    )
    expect(screen.getByText('18,426 files')).toBeInTheDocument()
    expect(screen.getByText('2.4 GB indexed')).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Run tests, typecheck, lint, format**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`

Troubleshooting note: `NavLink` in Sidebar requires a router context at render. In tests that render the shell's components alone, wrap with the real router (`app/router.tsx` + `createMemoryRouter` is overkill for Task 4's single footer test). For `pnpm dev`/`build` the router exists. The `Sidebar` component itself is verified visually (Step 9); `AppHeader` gets a smoke test in Task 8 where the memory router is introduced.

- [ ] **Step 9: Visual verification**

Run: `pnpm dev`, open `http://localhost:3000/`. Expected: dark shell with brand `imgsorter v2 / local library`, cyan `Scan library` button, `INDEXING COMPLETE / 100%`, nav list with `3` orange badge on Duplicates, header with search input + 2 `Select` controls + green status dot, footer totals. Compare spacing/colors against the prototype build (`C:\dev\repos\imgsorter-ui-v1\dist`).

- [ ] **Step 10: Commit**

```bash
git add app/components app/routes app/styles.css
git commit -m "feat: add app shell with sidebar, header, and footer"
```

## Task 5: Shared FilePreviewDrawer

**Files:**
- Create: `app/components/common/FilePreviewDrawer.tsx`
- Create: `app/components/common/FilePreviewDrawer.test.tsx`

**Interfaces:**
- Consumes: `useApp` (`selectedFile`, `setSelectedFile`), `formatBytes`, `thumbs`.
- Produces:
  - `export function FilePreviewDrawer(): ReactElement` — a Mantine `Drawer` (position right, title `File details`) bound to `selectedFile`. When a file is selected it shows: thumbnail via `style={{ backgroundImage: url(thumbs[id % 6]) }}` in `div.drawer-thumb`, PATH eyebrow + `Text.path`, a detail `Table` (Size via `formatBytes`, Extension, Created = `birthtime`, Hash = `hash || 'NULL — unverified'`), and a `Reveal` (cyan) + `Open file` (light) button pair (no handlers in Phase 1).

Note: the prototype has both an inline drawer (in App root) and an unused `FilePreview` component. The spec says drop `FilePreview`; the root drawer becomes this shared component mounted in `__root.tsx` (wired in Task 5 Step 5).

- [ ] **Step 1: Write failing test**

`app/components/common/FilePreviewDrawer.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { AppProvider } from '../../lib/app-context'
import { FilePreviewDrawer } from './FilePreviewDrawer'
import { entries } from '../../lib/mock-data'

function renderDrawer() {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <FilePreviewDrawer />
        <button onClick={() => {}}>open</button>
      </AppProvider>
    </MantineProvider>,
  )
}

describe('FilePreviewDrawer', () => {
  it('renders nothing while closed', () => {
    renderDrawer()
    expect(screen.queryByText('File details')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `pnpm test`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `app/components/common/FilePreviewDrawer.tsx`**

```tsx
import { Button, Drawer, Group, Table, Text } from '@mantine/core'
import { FileImage, FolderOpen } from 'lucide-react'
import { useApp } from '../../lib/app-context'
import { thumbs } from '../../lib/mock-data'
import { formatBytes } from '../../lib/format'

export function FilePreviewDrawer() {
  const { selectedFile, setSelectedFile } = useApp()

  return (
    <Drawer opened={!!selectedFile} onClose={() => setSelectedFile(null)} position="right" title="File details">
      {selectedFile && (
        <>
          <div
            className="drawer-thumb"
            style={{ backgroundImage: `url(${thumbs[(selectedFile.id || 1) % thumbs.length]})` }}
          />
          <Text className="eyebrow" mt="lg">
            PATH
          </Text>
          <Text size="sm" className="path">
            {selectedFile.path}
          </Text>
          <Table mt="lg">
            <Table.Tbody>
              {(
                [
                  ['Size', formatBytes(selectedFile.size)],
                  ['Extension', selectedFile.extension],
                  ['Created', selectedFile.birthtime],
                  ['Hash', selectedFile.hash || 'NULL — unverified'],
                ] as const
              ).map(([label, value]) => (
                <Table.Tr key={label}>
                  <Table.Td c="dimmed">{label}</Table.Td>
                  <Table.Td>{value}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group mt="xl">
            <Button leftSection={<FolderOpen size={15} />} color="cyan">
              Reveal
            </Button>
            <Button variant="light" leftSection={<FileImage size={15} />}>
              Open file
            </Button>
          </Group>
        </>
      )}
    </Drawer>
  )
}
```

- [ ] **Step 4: Add drawer styles to `app/styles.css`**

```css
.drawer-thumb {
  height: 190px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
}

.path {
  word-break: break-all;
  color: #8d98a8;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, monospace;
}
```

- [ ] **Step 5: Mount the drawer in `app/routes/__root.tsx`**

Add `import { FilePreviewDrawer } from '../components/common/FilePreviewDrawer'` and render `<FilePreviewDrawer />` as a sibling inside `<AppProvider>` in `RootDocument` (after the `div.app-shell`, still inside the provider):

- [ ] **Step 6: Run tests and see pass; run check**

Run: `pnpm test`
Expected: PASS (1 drawer test). Then `pnpm typecheck && pnpm lint && pnpm format:check`.

- [ ] **Step 7: Commit**

```bash
git add app/components/common/FilePreviewDrawer.tsx app/routes/__root.tsx app/styles.css
git commit -m "feat: add shared file preview drawer"
```

## Task 6: Overview feature + PageHeading wrapper

**Files:**
- Create: `app/components/common/PageHeading.tsx`
- Create: `app/features/overview/OverviewPage.tsx`
- Create: `app/features/overview/MetricCard.tsx`
- Create: `app/features/overview/StorageMap.tsx`
- Create: `app/features/overview/LastRunCard.tsx`
- Modify: `app/routes/index.tsx`
- Modify: `app/styles.css` (overview styles)

**Interfaces:**
- Consumes: `metricRows`, `storageRows`, `runSteps`, `largestFiles`, `thumbs`, `formatBytes`; `useRouter` from `@tanstack/react-router` for the "View analytics" link.
- Produces:
  - `export function PageHeading({ eyebrow, title, subtitle, showExport }: { eyebrow: string; title: string; subtitle: string; showExport?: boolean }): ReactElement` — renders the `eyebrow` + `h1` + dimmed subtitle row with a gray `Export` button when `showExport`.
  - `export function MetricCard({ label, value, note }: { label: string; value: string; note: string }): ReactElement`
  - `export function StorageMap(): ReactElement`
  - `export function LastRunCard(): ReactElement`
  - `export function OverviewPage(): ReactElement`

- [ ] **Step 1: Create `app/components/common/PageHeading.tsx`**

```tsx
import { Button, Group, Text } from '@mantine/core'
import { Download } from 'lucide-react'

export type PageHeadingProps = {
  eyebrow: string
  title: string
  subtitle: string
  showExport?: boolean
}

export function PageHeading({ eyebrow, title, subtitle, showExport }: PageHeadingProps) {
  return (
    <Group justify="space-between" mb="xl">
      <div>
        <Text className="eyebrow">{eyebrow}</Text>
        <h1>{title}</h1>
        <Text c="dimmed" size="sm">
          {subtitle}
        </Text>
      </div>
      {showExport && (
        <Group>
          <Button variant="light" leftSection={<Download size={15} />} color="gray">
            Export
          </Button>
        </Group>
      )}
    </Group>
  )
}
```

The eyebrow `LIBRARY OVERVIEW` and per-view subtitles flow from each route's page. Titles/subtitles used by routes:
- Overview: eyebrow `LIBRARY OVERVIEW`, title `Overview`, subtitle `A quiet view of what your library is keeping, duplicating, and missing.`
- Other views: eyebrow `LIBRARY OVERVIEW`, title = view label, subtitle = `Explore ${label.toLowerCase()} across your indexed media library.`

- [ ] **Step 2: Create `app/features/overview/MetricCard.tsx`**

```tsx
import { Card, Text } from '@mantine/core'

export type MetricCardProps = {
  label: string
  value: string
  note: string
}

export function MetricCard({ label, value, note }: MetricCardProps) {
  return (
    <Card className="metric" key={label}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <strong>{value}</strong>
      <Text size="xs" c={note === 'attention' ? 'orange' : 'cyan'}>
        {note || 'Indexed locally'}
      </Text>
    </Card>
  )
}
```

- [ ] **Step 3: Create `app/features/overview/StorageMap.tsx`**

```tsx
import { Card, Group, Progress, Text } from '@mantine/core'
import { HardDrive } from 'lucide-react'
import { storageRows } from '../../lib/mock-data'

export function StorageMap() {
  return (
    <Card>
      <Group justify="space-between" mb="lg">
        <div>
          <Text className="eyebrow">STORAGE MAP</Text>
          <h2>Where your library lives</h2>
        </div>
        <HardDrive size={18} />
      </Group>
      {storageRows.map(([path, value, size]) => (
        <div className="bar-row" key={path}>
          <Group justify="space-between">
            <Text size="sm">{path}</Text>
            <Text size="xs" c="dimmed">
              {size}
            </Text>
          </Group>
          <Progress value={value} color="cyan" mt={7} />
        </div>
      ))}
    </Card>
  )
}
```

- [ ] **Step 4: Create `app/features/overview/LastRunCard.tsx`**

```tsx
import { Card, Group, Text } from '@mantine/core'
import { CircleAlert, ShieldCheck } from 'lucide-react'
import { runSteps } from '../../lib/mock-data'

export function LastRunCard() {
  return (
    <Card>
      <Text className="eyebrow">LAST RUN</Text>
      <h2>Scan completed cleanly</h2>
      <div className="run-list">
        {runSteps.map(([name, time]) => (
          <Group justify="space-between" key={name}>
            <span>
              <ShieldCheck size={14} />
              {name}
            </span>
            <Text size="xs" c="dimmed">
              {time}
            </Text>
          </Group>
        ))}
      </div>
      <Text size="xs" c="orange" mt="lg">
        <CircleAlert size={13} /> 4 files could not be read
      </Text>
    </Card>
  )
}
```

- [ ] **Step 5: Create `app/features/overview/OverviewPage.tsx`**

```tsx
import { Button, Card, Group, Text } from '@mantine/core'
import { ChevronRight } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { PageHeading } from '../../components/common/PageHeading'
import { MetricCard } from './MetricCard'
import { StorageMap } from './StorageMap'
import { LastRunCard } from './LastRunCard'
import { largestFiles, metricRows, thumbs } from '../../lib/mock-data'
import { formatBytes } from '../../lib/format'

export function OverviewPage() {
  const router = useRouter()

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Overview"
        subtitle="A quiet view of what your library is keeping, duplicating, and missing."
        showExport
      />
      <div className="metric-grid">
        {metricRows.map(([label, value, note]) => (
          <MetricCard key={label} label={label} value={value} note={note} />
        ))}
      </div>
      <div className="two-col">
        <StorageMap />
        <LastRunCard />
      </div>
      <Card className="compact-list">
        <Group justify="space-between">
          <div>
            <Text className="eyebrow">AT A GLANCE</Text>
            <h2>Largest files</h2>
          </div>
          <Button variant="subtle" size="xs" onClick={() => router.navigate({ to: '/analytics' })}>
            View analytics <ChevronRight size={14} />
          </Button>
        </Group>
        {largestFiles.map((entry, i) => (
          <Group justify="space-between" className="file-row" key={entry.id}>
            <Group>
              <img src={thumbs[i % thumbs.length]} alt="" />
              <div>
                <Text size="sm">{entry.filename}</Text>
                <Text size="xs" c="dimmed">
                  {entry.directory}
                </Text>
              </div>
            </Group>
            <Text size="sm">{formatBytes(entry.size)}</Text>
          </Group>
        ))}
      </Card>
    </>
  )
}
```

- [ ] **Step 6: Modify `app/routes/index.tsx` to mount OverviewPage**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { OverviewPage } from '../features/overview/OverviewPage'

export const Route = createFileRoute('/')({
  component: OverviewPage,
})
```

- [ ] **Step 7: Add overview styles to `app/styles.css`**

```css
.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}

.metric {
  background: #171b22;
  border: 1px solid #2a323d;
  padding: 17px;
}

.metric strong {
  display: block;
  font-size: 24px;
  letter-spacing: -0.04em;
  margin: 9px 0 6px;
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-bottom: 18px;
}

.two-col .mantine-Card-root,
.compact-list {
  padding: 22px;
}

.bar-row {
  margin: 18px 0;
}

.run-list {
  display: grid;
  gap: 14px;
  margin-top: 19px;
}

.run-list span {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compact-list {
  margin-bottom: 18px;
}

.file-row {
  padding: 10px 0;
  border-top: 1px solid #2a323d;
}

.file-row img {
  width: 38px;
  height: 38px;
  object-fit: cover;
  border-radius: 5px;
}

@media (max-width: 900px) {
  .metric-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .two-col {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 650px) {
  .metric-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .two-col {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 8: Add a smoke test**

`app/features/overview/OverviewPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from '@tanstack/react-router'
import { MantineProvider } from '@mantine/core'
import { AppProvider } from '../../lib/app-context'
import { OverviewPage } from './OverviewPage'

describe('OverviewPage', () => {
  it('renders heading, metrics, and largest files', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <MemoryRouter>
          <AppProvider>
            <OverviewPage />
          </AppProvider>
        </MemoryRouter>
      </MantineProvider>,
    )
    expect(screen.getByText('A quiet view of what your library is keeping, duplicating, and missing.')).toBeInTheDocument()
    expect(screen.getByText('Total files')).toBeInTheDocument()
    expect(screen.getByText('Largest files')).toBeInTheDocument()
  })
})
```

- [ ] **Step 9: Run and see pass, run check**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all pass. Visual check via `pnpm dev` at `/`.

- [ ] **Step 10: Commit**

```bash
git add app/components/common/PageHeading.tsx app/features/overview app/routes/index.tsx app/styles.css
git commit -m "feat: add Overview feature with metric cards and storage map"
```

## Task 7: Files feature (Shared FilesPage + FilesTable) and /unique-files route

**Files:**
- Create: `app/features/files/FilesPage.tsx`
- Create: `app/features/files/FilesTable.tsx`
- Create: `app/features/files/FilesPage.test.tsx`
- Create: `app/routes/unique-files.tsx`
- Modify: `app/styles.css` (files styles)
- Create: `app/lib/filter-sync.ts` (search-param ↔ context sync helper)

**Interfaces:**
- Consumes: `useApp` (`filtered`, `setSelectedFile`), `formatBytes`.
- Produces:
  - `export type FilesTableProps = { files: Entry[]; unique?: boolean; onSelect: (e: Entry) => void }`
  - `export function FilesTable({ files, unique, onSelect }: FilesTableProps): ReactElement` — table with columns Filename / Location / Type / Size (+ Actions when `unique`). Rows clickable → `onSelect`. "Unique Files" filters the incoming `files` list with a per-page local `fileQuery`/`directory`/`count`/`size`/`extension` filter bar (see Note).
  - `export function FilesPage(): ReactElement` — renders `PageHeading` (eyebrow `LIBRARY OVERVIEW`, title `Unique Files`, subtitle `Explore unique files across your indexed media library.`) + `FilesTable` fed by `filtered`, `unique`. `onSelect` sets `selectedFile`.
  - `export function syncFiltersToSearch(...)` and `export function useFilterSearchParams()` from `app/lib/filter-sync.ts` (see Step 4).

Note on per-page filter bar: the prototype `Files` component has its own local filter bar (fileQuery/directory/count/size/extension) ON TOP of the global header filters. This plan keeps that behavior: `FilesPage` maintains local filter state and passes the *already-globally-filtered* `filtered` list through the local bar. `FilesTable` receives the final `files` list. Local options for `directory`/`extension` are derived from the incoming `files`. The `count` filter in the prototype is inert placeholder (`'All counts'` / `'Unique only'` leaves list unchanged); reproduce it as-is.

- [ ] **Step 1: Create `app/lib/filter-sync.ts`**

```tsx
import { useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useApp } from './app-context'

export type FilterSearch = {
  query?: string
  dir?: string
  ext?: string
}

export function useFilterSearchParams() {
  const { query, setQuery, dir, setDir, ext, setExt } = useApp()
  const search = useSearch({ strict: false }) as FilterSearch
  const navigate = useNavigate({ strict: false })

  useEffect(() => {
    if (search.query !== undefined && search.query !== query) setQuery(search.query)
    if (search.dir !== undefined && search.dir !== dir) setDir(search.dir)
    if (search.ext !== undefined && search.ext !== ext) setExt(search.ext)
  }, [search.query, search.dir, search.ext, query, dir, ext, setQuery, setDir, setExt])

  useEffect(() => {
    navigate({
      replace: true,
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        query: query || undefined,
        dir: dir === 'All directories' ? undefined : dir,
        ext: ext === 'All types' ? undefined : ext,
      }),
    })
  }, [query, dir, ext, navigate])
}
```

Note: `useSearch({ strict: false })` requires the route's `validateSearch` to allow unknown keys — covered in the route files (Task 7 Step 5, Task 8 Step 4, Task 9 Step 5) via `validateSearch` that passes through and declares the three keys. `strict: false` is the documented escape hatch; the routes additionally provide typed validation.

- [ ] **Step 2: Create `app/features/files/FilesTable.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Badge, Button, Group, Select, Table, Text, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { formatBytes } from '../../lib/format'
import type { Entry } from '../../lib/types'

export type FilesTableProps = {
  files: Entry[]
  unique?: boolean
  onSelect: (e: Entry) => void
}

export function FilesTable({ files, unique, onSelect }: FilesTableProps) {
  const [fileQuery, setFileQuery] = useState('')
  const [directory, setDirectory] = useState('All directories')
  const [count, setCount] = useState('All counts')
  const [size, setSize] = useState('All sizes')
  const [extension, setExtension] = useState('All extensions')

  const directories = useMemo(() => [...new Set(files.map((e) => e.directory))], [files])
  const extensions = useMemo(() => [...new Set(files.map((e) => e.extension))], [files])

  const list = useMemo(
    () =>
      [...files]
        .filter(
          (e) =>
            (!fileQuery || `${e.filename} ${e.path}`.toLowerCase().includes(fileQuery.toLowerCase())) &&
            (directory === 'All directories' || e.directory === directory) &&
            (extension === 'All extensions' || e.extension === extension) &&
            (count === 'All counts' || count === 'Unique only') &&
            (size === 'All sizes' ||
              (size === 'Under 10 MB' && e.size < 10000000) ||
              (size === '10–25 MB' && e.size >= 10000000 && e.size <= 25000000) ||
              (size === 'Over 25 MB' && e.size > 25000000)),
        )
        .sort((a, b) => a.filename.localeCompare(b.filename)),
    [files, fileQuery, directory, extension, count, size],
  )

  return (
    <>
      <Group className="duplicate-filters" justify="space-between" mb="md">
        <Group gap="8">
          <TextInput
            value={fileQuery}
            onChange={(event) => setFileQuery(event.currentTarget.value)}
            placeholder="Filter filename or path"
            leftSection={<Search size={15} />}
          />
          <Select value={directory} onChange={(v) => setDirectory(v ?? 'All directories')} data={['All directories', ...directories]} />
          <Select value={count} onChange={(v) => setCount(v ?? 'All counts')} data={['All counts', 'Unique only']} />
          <Select value={size} onChange={(v) => setSize(v ?? 'All sizes')} data={['All sizes', 'Under 10 MB', '10–25 MB', 'Over 25 MB']} />
          <Select value={extension} onChange={(v) => setExtension(v ?? 'All extensions')} data={['All extensions', ...extensions]} />
        </Group>
        <Text size="sm" c="dimmed">
          {list.length} files found
        </Text>
      </Group>
      <Table className="files-table" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Filename</Table.Th>
            <Table.Th>Location</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Size</Table.Th>
            {unique && <Table.Th>Actions</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((e) => (
            <Table.Tr key={e.id} onClick={() => onSelect(e)} className="file-table-row">
              <Table.Td>
                <Text size="sm" fw={500} truncate>
                  {e.filename}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text className="table-meta" size="xs" truncate>
                  {e.directory}
                </Text>
              </Table.Td>
              <Table.Td>
                <Badge variant="light">{e.extension}</Badge>
              </Table.Td>
              <Table.Td>
                <Text className="table-meta" size="xs">
                  {formatBytes(e.size)}
                </Text>
              </Table.Td>
              {unique && (
                <Table.Td>
                  <Button
                    variant="subtle"
                    size="xs"
                    className="preview-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(e)
                    }}
                  >
                    Preview
                  </Button>
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  )
}
```

- [ ] **Step 3: Create `app/features/files/FilesPage.tsx`**

```tsx
import { PageHeading } from '../../components/common/PageHeading'
import { FilesTable } from './FilesTable'
import { useApp } from '../../lib/app-context'

export function FilesPage() {
  const { filtered, setSelectedFile } = useApp()

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Unique Files"
        subtitle="Explore unique files across your indexed media library."
        showExport
      />
      <FilesTable files={filtered} unique onSelect={setSelectedFile} />
    </>
  )
}
```

- [ ] **Step 4: Note the heading divergence (+12% note)**

NOTE: The prototype title row for Unique Files shows "Unique Files" and the table receives `filtered.slice(0, 6)` (6 rows). The spec's FilesPage is shared by Unique Files + Browse with `unique` prop; the `slice(0, 6)` in the prototype is a data quirk tied to mock size. DECISION: do NOT slice — show all `filtered` rows. Visual parity is preserved because mock data has exactly 6 rows that pass no filters at defaults. Document this in the PR/commit body.

- [ ] **Step 5: Create `app/routes/unique-files.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { FilesPage } from '../features/files/FilesPage'
import { useFilterSearchParams } from '../lib/filter-sync'

export const Route = createFileRoute('/unique-files')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
  }),
  component: UniqueFilesRoute,
})

function UniqueFilesRoute() {
  useFilterSearchParams()
  return <FilesPage />
}
```

- [ ] **Step 6: Add smoke test for FilesPage**

`app/features/files/FilesPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from '@tanstack/react-router'
import { MantineProvider } from '@mantine/core'
import { AppProvider } from '../../lib/app-context'
import { FilesPage } from './FilesPage'
import { entries } from '../../lib/mock-data'

describe('FilesPage', () => {
  it('renders all unique-file rows from global filter', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <MemoryRouter>
          <AppProvider>
            <FilesPage />
          </AppProvider>
        </MemoryRouter>
      </MantineProvider>,
    )
    expect(screen.getByText(`${entries.length} files found`)).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Add files styles to `app/styles.css`**

```css
.files-table {
  background: #171b22;
  border: 1px solid #2a323d;
  border-radius: 8px;
  overflow: hidden;
}

.files-table th {
  color: #8d98a8;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

.files-table td,
.files-table th {
  padding: 4px 12px;
  border-bottom: 1px solid #2a323d;
}

.files-table tr:last-child td {
  border-bottom: 0;
}

.file-table-row {
  cursor: pointer;
}

.file-table-row .table-meta {
  font-size: 11px;
  color: #8d98a8;
}

.files-table td:first-child .mantine-Text-root {
  font-size: 12px;
}

.files-table .preview-button {
  height: 22px;
  min-height: 22px;
  padding: 0 7px;
  font-size: 10px;
}

.duplicate-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.duplicate-filters .mantine-TextInput-input,
.duplicate-filters .mantine-Select-input {
  height: 30px;
  min-height: 30px;
  font-size: 12px;
}

.duplicate-filters .mantine-TextInput-root {
  width: 250px;
}

.duplicate-filters .mantine-Select-root {
  width: 190px;
}
```

- [ ] **Step 8: Run tests and check**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all pass. Then verify via `pnpm dev` at `/unique-files`: table with header + 6 rows, Actions column with `Preview` buttons, click a row opens the drawer (Task 5 component mounted in root).

- [ ] **Step 9: Commit**

```bash
git add app/lib/filter-sync.ts app/features/files app/routes/unique-files.tsx app/styles.css
git commit -m "feat: add Files feature with table and unique-files route"
```

## Task 8: Browse feature (DirectoryTree + route + selectedDirs params)

**Files:**
- Create: `app/components/common/DirectoryTree.tsx`
- Create: `app/features/browse/BrowsePage.tsx`
- Create: `app/features/browse/BrowsePage.test.tsx`
- Create: `app/routes/browse.tsx`
- Modify: `app/styles.css` (browse styles)
- Modify: `app/lib/filter-sync.ts` (add selectedDirs to search sync)

**Interfaces:**
- Consumes: `useApp` (`filtered`, `selectedDirs`, `toggleSelectedDir`, `setSelectedFile`), `directoryTree`.
- Produces:
  - `export function DirectoryTree(): ReactElement` — reads `selectedDirs`/`toggleSelectedDir` from context; renders the nested expandable tree exactly per prototype (checkboxes with `Filter ${label}` aria-labels, expand chevrons, `DIRECTORY FILTER` header + collapse button).
  - `export function BrowsePage(): ReactElement` — `PageHeading` (title `Browse`) + `.browse-layout` with `<DirectoryTree />` and `<FilesPage />`-style table WITHOUT `unique` (reuse `FilesTable`).
  - `app/routes/browse.tsx` — route with `validateSearch` adding `selectedDirs?: string[]`.

- [ ] **Step 1: Extend `app/lib/filter-sync.ts` for selectedDirs**

Replace the file content with:

```tsx
import { useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useApp } from './app-context'

export type FilterSearch = {
  query?: string
  dir?: string
  ext?: string
  selectedDirs?: string[]
}

export function useFilterSearchParams() {
  const { query, setQuery, dir, setDir, ext, setExt } = useApp()
  const search = useSearch({ strict: false }) as FilterSearch
  const navigate = useNavigate()

  useEffect(() => {
    if (search.query !== undefined && search.query !== query) setQuery(search.query)
    if (search.dir !== undefined && search.dir !== dir) setDir(search.dir)
    if (search.ext !== undefined && search.ext !== ext) setExt(search.ext)
  }, [search.query, search.dir, search.ext, query, dir, ext, setQuery, setDir, setExt])

  useEffect(() => {
    navigate({
      replace: true,
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        query: query || undefined,
        dir: dir === 'All directories' ? undefined : dir,
        ext: ext === 'All types' ? undefined : ext,
      }),
    })
  }, [query, dir, ext, navigate])
}

export function useSelectedDirsSearchParams() {
  const { selectedDirs, setSelectedDirs } = useApp()
  const search = useSearch({ strict: false }) as FilterSearch
  const navigate = useNavigate()

  useEffect(() => {
    if (search.selectedDirs !== undefined) {
      const incoming = [...search.selectedDirs].sort().join('|')
      const current = [...selectedDirs].sort().join('|')
      if (incoming !== current) setSelectedDirs(search.selectedDirs)
    }
  }, [search.selectedDirs, selectedDirs, setSelectedDirs])

  useEffect(() => {
    navigate({
      replace: true,
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        selectedDirs: selectedDirs.length > 0 ? selectedDirs : undefined,
      }),
    })
  }, [selectedDirs, navigate])
}
```

Note: the read effect compares sorted-joined contents so the write→read cycle converges without an infinite loop, and `setSelectedDirs` is exposed on the `AppContextValue` (see Task 3).

- [ ] **Step 2: Create `app/components/common/DirectoryTree.tsx`**

```tsx
import { useState, type ReactElement } from 'react'
import { Button, Checkbox, Group, Text } from '@mantine/core'
import { ChevronDown, ChevronRight, ChevronsUpDown, FolderOpen } from 'lucide-react'
import { directoryTree } from '../../lib/mock-data'
import type { DirectoryNode } from '../../lib/types'
import { useApp } from '../../lib/app-context'

export function DirectoryTree() {
  const { selectedDirs, toggleSelectedDir } = useApp()
  const [nodeOpen, setNodeOpen] = useState<Record<string, boolean>>({ 'C:/Media': true, 'C:/Media/2025': true })

  const render = (node: DirectoryNode, depth: number): ReactElement => (
    <div key={node.path}>
      <div className="directory-node" style={{ paddingLeft: depth * 14 }}>
        <button
          className="directory-expand"
          aria-label={`${nodeOpen[node.path] ? 'Collapse' : 'Expand'} ${node.label}`}
          onClick={() =>
            node.children &&
            setNodeOpen((state) => ({ ...state, [node.path]: !state[node.path] }))
          }
        >
          {node.children ? (nodeOpen[node.path] ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="directory-spacer" />}
        </button>
        <Checkbox
          checked={selectedDirs.includes(node.path)}
          onChange={() => toggleSelectedDir(node.path)}
          aria-label={`Filter ${node.label}`}
        />
        <FolderOpen size={14} />
        <Text size="xs">{node.label}</Text>
      </div>
      {node.children && nodeOpen[node.path] && node.children.map((child) => render(child, depth + 1))}
    </div>
  )

  return (
    <aside className="browse-directory-filter">
      <Group justify="space-between" mb="sm">
        <Text className="eyebrow">DIRECTORY FILTER</Text>
        <Button variant="subtle" size="xs" aria-label="Collapse directory filter">
          <ChevronsUpDown size={14} />
        </Button>
      </Group>
      {directoryTree.map((node) => render(node, 0))}
    </aside>
  )
}
```

- [ ] **Step 3: Create `app/features/browse/BrowsePage.tsx`**

```tsx
import { PageHeading } from '../../components/common/PageHeading'
import { DirectoryTree } from '../../components/common/DirectoryTree'
import { FilesTable } from '../files/FilesTable'
import { useApp } from '../../lib/app-context'

export function BrowsePage() {
  const { filtered, setSelectedFile } = useApp()

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Browse"
        subtitle="Explore browse across your indexed media library."
        showExport
      />
      <div className="browse-layout">
        <DirectoryTree />
        <div className="browse-results">
          <FilesTable files={filtered} onSelect={setSelectedFile} />
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Create `app/routes/browse.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { BrowsePage } from '../features/browse/BrowsePage'
import { useFilterSearchParams, useSelectedDirsSearchParams } from '../lib/filter-sync'

function normalizeDirs(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((v): v is string => typeof v === 'string')
}

export const Route = createFileRoute('/browse')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
    selectedDirs: normalizeDirs(search.selectedDirs),
  }),
  component: BrowseRoute,
})

function BrowseRoute() {
  useFilterSearchParams()
  useSelectedDirsSearchParams()
  return <BrowsePage />
}
```

- [ ] **Step 5: Add browse styles to `app/styles.css`**

```css
.browse-layout {
  display: flex;
  align-items: stretch;
  gap: 16px;
}

.browse-directory-filter {
  width: 240px;
  flex: none;
  padding: 16px;
  border: 1px solid #2a323d;
  background: #171b22;
  border-radius: 8px;
}

.directory-node {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  border-radius: 4px;
}

.directory-node:hover {
  background: #1d232c;
}

.directory-expand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 20px;
  padding: 0;
  border: 0;
  background: none;
  color: #8d98a8;
  cursor: pointer;
}

.directory-spacer {
  width: 13px;
}

.browse-results {
  min-width: 0;
  flex: 1;
}

@media (max-width: 800px) {
  .browse-layout {
    display: block;
  }
  .browse-directory-filter {
    width: auto;
    margin-bottom: 16px;
  }
}
```

- [ ] **Step 6: Add smoke test**

`app/features/browse/BrowsePage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from '@tanstack/react-router'
import { MantineProvider } from '@mantine/core'
import { AppProvider } from '../../lib/app-context'
import { BrowsePage } from './BrowsePage'
import { entries } from '../../lib/mock-data'

describe('BrowsePage', () => {
  it('renders directory filter and results', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <MemoryRouter>
          <AppProvider>
            <BrowsePage />
          </AppProvider>
        </MemoryRouter>
      </MantineProvider>,
    )
    expect(screen.getByText('DIRECTORY FILTER')).toBeInTheDocument()
    expect(screen.getByText(`${entries.length} files found`)).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run tests and check; visual verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Then `pnpm dev` at `/browse`: sidebar tree on the left with expandable `C:/Media` → `2025` → `Trips`, and root checkboxes; no Actions column. Checking a node shows only entries whose directory equals or is under it (`C:/Media` filters to 2025 + Trips rows).

- [ ] **Step 8: Commit**

```bash
git add app/components/common/DirectoryTree.tsx app/features/browse app/routes/browse.tsx app/lib/filter-sync.ts app/styles.css
git commit -m "feat: add Browse feature with directory tree filter"
```

## Task 9: Duplicates feature (table, directory picker, keep toggles, route)

**Files:**
- Create: `app/features/duplicates/DuplicatesPage.tsx`
- Create: `app/features/duplicates/DuplicateGroupTable.tsx`
- Create: `app/features/duplicates/DirectoryPicker.tsx`
- Create: `app/features/duplicates/KeepToggle.tsx`
- Create: `app/routes/duplicates.tsx`
- Modify: `app/styles.css` (duplicates styles)

**Interfaces:**
- Consumes: `groups`, `entries` (for directory/extension option derivation), `useApp` (`keepers`, `toggleKeeper`, `setSelectedFile`, `setKeepers`), `formatBytes`, filter search params via `useFilterSearchParams`.
- Produces:
  - `export function KeepToggle({ keeper, onToggle }: { keeper: boolean; onToggle: () => void }): ReactElement` — renders `Keep`/`Keeper` compact button using `keeper` boolean.
  - `export function DirectoryPicker({ applied, onApply }: { applied: string[]; onApply: (dirs: string[]) => void }): ReactElement` — Popover with search input, Select visible / Clear, ScrollArea of directory checkboxes with counts, Cancel / Apply.
  - `export function DuplicateGroupTable(...): ReactElement` — renders the group-level table from Task 9 Step 3.
  - `export function DuplicatesPage(): ReactElement` — `PageHeading` (title `Duplicates`) + local filter bar + `DuplicateGroupTable`; syncs filter search params.

- [ ] **Step 1: Create `app/features/duplicates/KeepToggle.tsx`**

```tsx
import { Button } from '@mantine/core'

export type KeepToggleProps = {
  keeper: boolean
  onToggle: () => void
}

export function KeepToggle({ keeper, onToggle }: KeepToggleProps) {
  return (
    <Button size="compact-xs" variant={keeper ? 'filled' : 'subtle'} onClick={onToggle}>
      {keeper ? 'Keeper' : 'Keep'}
    </Button>
  )
}
```

- [ ] **Step 2: Create `app/features/duplicates/DirectoryPicker.tsx`**

```tsx
import { useState } from 'react'
import { Button, Checkbox, Group, Popover, ScrollArea, Text, TextInput } from '@mantine/core'
import { ChevronsUpDown, Search } from 'lucide-react'

export type DirectoryOption = { value: string; label: string; count: number }

export type DirectoryPickerProps = {
  applied: string[]
  options: DirectoryOption[]
  onApply: (dirs: string[]) => void
}

export function DirectoryPicker({ applied, options, onApply }: DirectoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [directoryQuery, setDirectoryQuery] = useState('')
  const [draft, setDraft] = useState<string[]>([])

  const visible = options.filter((o) => !directoryQuery || o.label.toLowerCase().includes(directoryQuery.toLowerCase()))

  return (
    <Popover opened={open} onChange={setOpen} width={320} position="bottom-start" shadow="md">
      <Popover.Target>
        <Button
          size="xs"
          variant="default"
          className="directory-filter"
          onClick={() => {
            setDraft(applied)
            setOpen((v) => !v)
          }}
        >
          <span>{applied.length === 0 ? 'All directories' : `${applied.length} directories`}</span>
          <ChevronsUpDown size={15} />
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <TextInput
          size="xs"
          autoFocus
          placeholder="Search directories"
          value={directoryQuery}
          onChange={(event) => setDirectoryQuery(event.currentTarget.value)}
          leftSection={<Search size={13} />}
          mb="xs"
        />
        <Group justify="space-between" mb="xs">
          <Text size="xs" c="dimmed">
            Select directories
          </Text>
          <Group gap={4}>
            <Button variant="subtle" size="compact-xs" onClick={() => setDraft(visible.map((item) => item.value))}>
              Select visible
            </Button>
            <Button variant="subtle" size="compact-xs" onClick={() => setDraft([])}>
              Clear
            </Button>
          </Group>
        </Group>
        <ScrollArea h={220}>
          {visible.map((item) => (
            <div className="directory-option" key={item.value}>
              <Checkbox
                size="xs"
                checked={draft.includes(item.value)}
                onChange={() => setDraft((v) => (v.includes(item.value) ? v.filter((x) => x !== item.value) : [...v, item.value]))}
                label={item.label}
              />
              <Text size="xs" c="dimmed">
                {item.count}
              </Text>
            </div>
          ))}
        </ScrollArea>
        <Group justify="flex-end" mt="xs" className="picker-actions">
          <Button size="compact-xs" variant="subtle" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="compact-xs" color="cyan" onClick={() => onApply(draft) || setOpen(false)}>
            Apply
          </Button>
        </Group>
      </Popover.Dropdown>
    </Popover>
  )
}
```

Note: `onApply(draft) || setOpen(false)` works because `onApply` returns `void`; if you prefer explicitness, split into two statements in implementation. Keep behavior identical.

- [ ] **Step 3: Create `app/features/duplicates/DuplicateGroupTable.tsx`**

```tsx
import { Fragment, useMemo, useState } from 'react'
import { Badge, Button, Group, Table, Text } from '@mantine/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatBytes } from '../../lib/format'
import type { DuplicateGroup, Entry } from '../../lib/types'
import { KeepToggle } from './KeepToggle'

export type DuplicateGroupTableProps = {
  groups: DuplicateGroup[]
  keepers: number[]
  onToggleKeeper: (id: number) => void
  onSelect: (e: Entry) => void
}

export function DuplicateGroupTable({ groups, keepers, onToggleKeeper, onSelect }: DuplicateGroupTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<'count' | 'name' | 'redundant'>('count')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(
    () =>
      [...groups].sort((a, b) => {
        const av = sortKey === 'count' ? a.count : sortKey === 'redundant' ? parseFloat(a.space) : a.name
        const bv = sortKey === 'count' ? b.count : sortKey === 'redundant' ? parseFloat(b.space) : b.name
        const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
        return direction === 'asc' ? result : -result
      }),
    [groups, sortKey, direction],
  )

  const headerClick = (key: 'count' | 'name' | 'redundant') => {
    if (sortKey === key) {
      setDirection((v) => (v === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setDirection(key === 'name' ? 'asc' : 'desc')
    }
  }

  const arrow = (key: 'count' | 'name' | 'redundant') =>
    sortKey === key ? (direction === 'asc' ? '↑' : '↓') : ''

  return (
    <div className="duplicate-table-wrap">
      <Table className="duplicate-table" verticalSpacing="xs" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="sortable-th" onClick={() => headerClick('count')}>
              Group {arrow('count')}
            </Table.Th>
            <Table.Th className="sortable-th" onClick={() => headerClick('name')}>
              Filename {arrow('name')}
            </Table.Th>
            <Table.Th>Directory</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th className="sortable-th" onClick={() => headerClick('redundant')}>
              Redundant {arrow('redundant')}
            </Table.Th>
            <Table.Th>Modified</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((g) => (
            <Fragment key={g.hash}>
              <Table.Tr className="group-row" onClick={() => setExpanded(expanded === g.hash ? null : g.hash)}>
                <Table.Td>
                  <Group gap={6}>
                    <span className="chevron">{expanded === g.hash ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                    <Badge size="xs" color={g.count > 2 ? 'orange' : 'gray'}>
                      ×{g.count}
                    </Badge>
                    <Text size="xs" fw={600}>
                      {g.name}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td colSpan={5}>
                  <Text size="xs" c="dimmed">
                    {g.hash} · {g.space} redundant
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {g.files.length} visible
                  </Text>
                </Table.Td>
              </Table.Tr>
              {expanded === g.hash &&
                g.files.map((e) => (
                  <Table.Tr key={e.id} className={keepers.includes(e.id) ? 'keeper-row' : ''}>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        ↳
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" className="mono file-name-cell" title={e.filename} onClick={() => onSelect(e)}>
                        {e.filename}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" className="mono directory-cell" title={e.directory}>
                        {e.directory}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light">
                        {e.extension}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">{formatBytes(e.size)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {e.birthtime.slice(0, 10)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <KeepToggle keeper={keepers.includes(e.id)} onToggle={() => onToggleKeeper(e.id)} />
                        <Button size="compact-xs" variant="subtle" onClick={() => onSelect(e)}>
                          Preview
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
            </Fragment>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/features/duplicates/DuplicatesPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Group, Select, Text, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { PageHeading } from '../../components/common/PageHeading'
import { DuplicateGroupTable } from './DuplicateGroupTable'
import { DirectoryPicker } from './DirectoryPicker'
import { groups } from '../../lib/mock-data'
import { useApp } from '../../lib/app-context'

export function DuplicatesPage() {
  const { keepers, toggleKeeper, setSelectedFile } = useApp()
  const [fileQuery, setFileQuery] = useState('')
  const [extension, setExtension] = useState('All extensions')
  const [appliedDirectories, setAppliedDirectories] = useState<string[]>([])
  const [countFilter, setCountFilter] = useState('All counts')
  const [sizeFilter, setSizeFilter] = useState('All sizes')

  const directories = useMemo(() => [...new Set(groups.flatMap((g) => g.files.map((e) => e.directory)))], [])
  const extensions = useMemo(() => [...new Set(groups.flatMap((g) => g.files.map((e) => e.extension)))], [])
  const directoryOptions = useMemo(
    () =>
      directories.map((d) => ({
        value: d,
        label: d,
        count: groups.filter((g) => g.files.some((e) => e.directory === d)).length,
      })),
    [directories],
  )

  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          files: g.files.filter(
            (e) =>
              (!fileQuery || `${e.filename} ${e.path}`.toLowerCase().includes(fileQuery.toLowerCase())) &&
              (appliedDirectories.length === 0 || appliedDirectories.includes(e.directory)) &&
              (extension === 'All extensions' || e.extension === extension),
          ),
        }))
        .filter(
          (g) =>
            g.files.length &&
            (countFilter === 'All counts' || (countFilter === '2 files' && g.count === 2) || (countFilter === '3+ files' && g.count >= 3)) &&
            (sizeFilter === 'All sizes' ||
              (sizeFilter === 'Under 10 MB' && g.files[0].size < 10000000) ||
              (sizeFilter === '10–25 MB' && g.files[0].size >= 10000000 && g.files[0].size <= 25000000) ||
              (sizeFilter === 'Over 25 MB' && g.files[0].size > 25000000)),
        ),
    [fileQuery, extension, appliedDirectories, countFilter, sizeFilter],
  )

  const visibleFiles = useMemo(() => visibleGroups.reduce((n, g) => n + g.files.length, 0), [visibleGroups])

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Duplicates"
        subtitle="Explore duplicates across your indexed media library."
      />
      <div className="duplicates-view">
        <Group className="duplicate-filters" gap="8" wrap="wrap">
          <TextInput
            size="xs"
            placeholder="Filter filename or path"
            value={fileQuery}
            onChange={(event) => setFileQuery(event.currentTarget.value)}
            leftSection={<Search size={14} />}
          />
          <DirectoryPicker applied={appliedDirectories} options={directoryOptions} onApply={setAppliedDirectories} />
          <Select size="xs" value={countFilter} onChange={(v) => setCountFilter(v ?? 'All counts')} data={['All counts', '2 files', '3+ files']} />
          <Select size="xs" value={sizeFilter} onChange={(v) => setSizeFilter(v ?? 'All sizes')} data={['All sizes', 'Under 10 MB', '10–25 MB', 'Over 25 MB']} />
          <Select size="xs" value={extension} onChange={(v) => setExtension(v ?? 'All extensions')} data={['All extensions', ...extensions]} />
          <Text size="xs" c="dimmed" className="filter-count">
            {visibleGroups.length} groups · {visibleFiles} files · {keepers.length} keepers
          </Text>
        </Group>
        <DuplicateGroupTable groups={visibleGroups} keepers={keepers} onToggleKeeper={toggleKeeper} onSelect={setSelectedFile} />
      </div>
    </>
  )
}
```

- [ ] **Step 5: Create `app/routes/duplicates.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { DuplicatesPage } from '../features/duplicates/DuplicatesPage'
import { useFilterSearchParams } from '../lib/filter-sync'

export const Route = createFileRoute('/duplicates')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
  }),
  component: DuplicatesRoute,
})

function DuplicatesRoute() {
  useFilterSearchParams()
  return <DuplicatesPage />
}
```

- [ ] **Step 6: Add duplicates styles to `app/styles.css`**

```css
.duplicates-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.duplicate-filters > .mantine-Text-root {
  font-size: 12px;
}

.duplicate-filters .directory-filter {
  width: 190px;
  height: 30px;
  min-height: 30px;
  padding: 0 8px 0 12px;
  border: 1px solid rgb(66, 66, 66);
  border-radius: 8px;
  background: rgb(46, 46, 46);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  font-size: 12px;
  line-height: 1;
  font-weight: 400;
  color: rgb(201, 201, 201);
  text-align: left;
}

.duplicate-filters .directory-filter span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duplicate-filters .directory-filter svg {
  flex: none;
  width: 10px;
  height: 10px;
  margin-left: auto;
  color: #777;
  stroke-width: 1.5;
  opacity: 1;
}

.duplicate-filters .directory-filter:hover {
  background: rgb(46, 46, 46);
  border-color: rgb(66, 66, 66);
}

.duplicate-filters .directory-filter[data-active] {
  color: #edf3f7;
}

.duplicate-filters .mantine-Popover-dropdown {
  background: #171c22;
  border-color: #2a323d;
  padding: 8px;
}

.duplicate-filters .mantine-Popover-dropdown .mantine-Button-root {
  color: #edf3f7;
  text-align: left;
}

.duplicate-filters .mantine-Popover-dropdown .mantine-Button-root:hover {
  background: #222b34;
}

.directory-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 6px 8px;
  border-radius: 4px;
  color: #edf3f7;
  padding-left: 8px !important;
}

.directory-option:hover {
  background: #222b34;
}

.directory-option .mantine-Checkbox-root {
  min-width: 0;
  flex: 1;
  width: 100%;
  display: flex;
  justify-content: flex-start;
}

.directory-option .mantine-Checkbox-inner {
  flex: none;
}

.directory-option .mantine-Checkbox-labelWrapper {
  min-width: 0;
  flex: 1;
  text-align: left;
}

.directory-option .mantine-Checkbox-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-option > .mantine-Text-root {
  flex: none;
  min-width: 64px;
  text-align: right;
  padding-left: 16px;
}

.picker-actions {
  border-top: 1px solid #2a323d;
  padding-top: 8px;
}

.filter-count {
  margin-left: auto;
}

.duplicate-table-wrap {
  border: 1px solid #2a323d;
  border-radius: 8px;
  overflow: auto;
  background: #171b22;
}

.duplicate-table {
  min-width: 920px;
}

.duplicate-table thead tr {
  background: #1d232c;
}

.duplicate-table th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8d98a8;
  font-weight: 600;
  padding: 9px 12px;
  white-space: nowrap;
}

.duplicate-table .sortable-th {
  cursor: pointer;
  user-select: none;
}

.duplicate-table .sortable-th:hover {
  color: #edf3f7;
}

.duplicate-table td {
  padding: 7px 12px;
  height: 38px;
  border-color: #252c35;
  white-space: nowrap;
}

.duplicate-table .file-name-cell {
  display: block;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.duplicate-table td:nth-child(3) {
  width: 230px;
  max-width: 230px;
  overflow: hidden;
}

.duplicate-table .directory-cell {
  display: block;
  max-width: 202px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duplicate-table .group-row {
  cursor: pointer;
  background: #1a2028;
}

.duplicate-table .group-row:hover {
  background: #202932;
}

.duplicate-table .group-row td:first-child {
  border-left: 2px solid #18c7d8;
}

.duplicate-table .keeper-row {
  background: #18343a;
}

.duplicate-table .keeper-row td:first-child {
  border-left: 2px solid #18c7d8;
}

.chevron {
  color: #8d98a8;
  display: flex;
}
```

- [ ] **Step 7: Add smoke test**

`app/features/duplicates/DuplicatesPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from '@tanstack/react-router'
import { MantineProvider } from '@mantine/core'
import { AppProvider } from '../../lib/app-context'
import { DuplicatesPage } from './DuplicatesPage'

describe('DuplicatesPage', () => {
  it('renders group table with keepers prompt', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <MemoryRouter>
          <AppProvider>
            <DuplicatesPage />
          </AppProvider>
        </MemoryRouter>
      </MantineProvider>,
    )
    expect(screen.getByText('3 groups · 10 files · 0 keepers')).toBeInTheDocument()
    expect(screen.getByText('mountain-lake.jpg')).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Run tests and check; visual verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Then `pnpm dev` at `/duplicates`: group rows (`×5 mountain-lake.jpg`, `×3 shoreline.jpg`, `×2 forest-trail.jpg`) expand on click; expanded rows have `Keep`/`Keeper` buttons that tint the row when active; `Preview` opens the drawer; the filter bar counts update; the directory picker popover works.

- [ ] **Step 9: Commit**

```bash
git add app/features/duplicates app/routes/duplicates.tsx app/styles.css
git commit -m "feat: add Duplicates feature with keeper toggles"
```

## Task 10: Analytics feature + route

**Files:**
- Create: `app/features/analytics/AnalyticsPage.tsx`
- Create: `app/routes/analytics.tsx`
- Modify: `app/styles.css` (analytics styles)

**Interfaces:**
- Consumes: `entries`, `groups`, `formatBytes`.
- Produces: `export function AnalyticsPage(): ReactElement` — two cards "Biggest files" (ranked by size) and "Most duplicated" (ranked by copies), each with an independent page-size Select (`5`/`10`/`25`, default `10`) and Previous/Next pagination.

- [ ] **Step 1: Create `app/features/analytics/AnalyticsPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Button, Card, Group, Select, Table, Text } from '@mantine/core'
import { PageHeading } from '../../components/common/PageHeading'
import { formatBytes } from '../../lib/format'
import { entries, groups } from '../../lib/mock-data'

export function AnalyticsPage() {
  const [pageSize, setPageSize] = useState('10')
  const [copiesPageSize, setCopiesPageSize] = useState('10')
  const [sizePage, setSizePage] = useState(1)
  const [copiesPage, setCopiesPage] = useState(1)

  const rankedBySize = [...entries].sort((a, b) => b.size - a.size)
  const rankedByCopies = [...groups].sort((a, b) => b.count - a.count)
  const sizeLimit = Number(pageSize)
  const copiesLimit = Number(copiesPageSize)
  const sizePages = Math.max(1, Math.ceil(rankedBySize.length / sizeLimit))
  const copiesPages = Math.max(1, Math.ceil(rankedByCopies.length / copiesLimit))

  useEffect(() => {
    setSizePage(1)
  }, [pageSize, rankedBySize.length])
  useEffect(() => {
    setCopiesPage(1)
  }, [copiesPageSize, rankedByCopies.length])

  const sizeRows = rankedBySize.slice((sizePage - 1) * sizeLimit, sizePage * sizeLimit)
  const copiesRows = rankedByCopies.slice((copiesPage - 1) * copiesLimit, copiesPage * copiesLimit)

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Analytics"
        subtitle="Explore analytics across your indexed media library."
      />
      <div className="two-col">
        <Card>
          <Group justify="space-between" align="flex-start">
            <div>
              <Text className="eyebrow">RANKED BY SIZE</Text>
              <h2>Biggest files</h2>
            </div>
            <Select
              aria-label="Items per page for ranked by size"
              value={pageSize}
              onChange={(v) => setPageSize(v ?? '5')}
              data={['5', '10', '25']}
              w={72}
            />
          </Group>
          <Table className="analytics-ranking-table" mt="md">
            <Table.Tbody>
              {sizeRows.map((e, i) => (
                <Table.Tr key={e.id}>
                  <Table.Td>{(sizePage - 1) * sizeLimit + i + 1}</Table.Td>
                  <Table.Td>{e.filename}</Table.Td>
                  <Table.Td>{formatBytes(e.size)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group className="analytics-pagination" justify="space-between" mt="md">
            <Button variant="subtle" size="xs" disabled={sizePage === 1} onClick={() => setSizePage((page) => Math.max(1, page - 1))}>
              Previous
            </Button>
            <Text size="xs" c="dimmed">
              Page {sizePage} of {sizePages}
            </Text>
            <Button variant="subtle" size="xs" disabled={sizePage === sizePages} onClick={() => setSizePage((page) => Math.min(sizePages, page + 1))}>
              Next
            </Button>
          </Group>
        </Card>
        <Card>
          <Group justify="space-between" align="flex-start">
            <div>
              <Text className="eyebrow">RANKED BY COPIES</Text>
              <h2>Most duplicated</h2>
            </div>
            <Select
              aria-label="Items per page for ranked by copies"
              value={copiesPageSize}
              onChange={(v) => setCopiesPageSize(v ?? '5')}
              data={['5', '10', '25']}
              w={72}
            />
          </Group>
          <Table className="analytics-ranking-table" mt="md">
            <Table.Tbody>
              {copiesRows.map((g, i) => (
                <Table.Tr key={g.hash}>
                  <Table.Td>{(copiesPage - 1) * copiesLimit + i + 1}</Table.Td>
                  <Table.Td>{g.name}</Table.Td>
                  <Table.Td>×{g.count}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group className="analytics-pagination" justify="space-between" mt="md">
            <Button variant="subtle" size="xs" disabled={copiesPage === 1} onClick={() => setCopiesPage((page) => Math.max(1, page - 1))}>
              Previous
            </Button>
            <Text size="xs" c="dimmed">
              Page {copiesPage} of {copiesPages}
            </Text>
            <Button variant="subtle" size="xs" disabled={copiesPage === copiesPages} onClick={() => setCopiesPage((page) => Math.min(copiesPages, page + 1))}>
              Next
            </Button>
          </Group>
        </Card>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create `app/routes/analytics.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { AnalyticsPage } from '../features/analytics/AnalyticsPage'

export const Route = createFileRoute('/analytics')({
  component: AnalyticsPage,
})
```

- [ ] **Step 3: Add analytics styles to `app/styles.css`**

```css
.analytics-ranking-table td {
  font-size: 12px;
}
```

- [ ] **Step 4: Add smoke test**

`app/features/analytics/AnalyticsPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from '@tanstack/react-router'
import { MantineProvider } from '@mantine/core'
import { AppProvider } from '../../lib/app-context'
import { AnalyticsPage } from './AnalyticsPage'

describe('AnalyticsPage', () => {
  it('renders both ranking cards', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <MemoryRouter>
          <AppProvider>
            <AnalyticsPage />
          </AppProvider>
        </MemoryRouter>
      </MantineProvider>,
    )
    expect(screen.getByText('Biggest files')).toBeInTheDocument()
    expect(screen.getByText('Most duplicated')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run tests and check; visual verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Then `pnpm dev` at `/analytics`: two side-by-side cards; page-size selects and pagination work; the Overview "View analytics" button navigates here.

- [ ] **Step 6: Commit**

```bash
git add app/features/analytics app/routes/analytics.tsx app/styles.css
git commit -m "feat: add Analytics feature with ranking tables"
```

## Task 11: Activity feature + route

**Files:**
- Create: `app/features/activity/ActivityPage.tsx`
- Create: `app/routes/activity.tsx`
- Modify: `app/styles.css` (activity styles)

**Interfaces:**
- Consumes: `useApp` (`scanActive`, `logs`).
- Produces: `export function ActivityPage(): ReactElement` — heading with Running/Complete Badge, "Current scan" progress card, reverse-chronological event log.

- [ ] **Step 1: Create `app/features/activity/ActivityPage.tsx`**

```tsx
import { Badge, Card, Group, Progress, Text } from '@mantine/core'
import { PageHeading } from '../../components/common/PageHeading'
import { useApp } from '../../lib/app-context'

export function ActivityPage() {
  const { scanActive, logs } = useApp()

  const badgeColor = scanActive ? 'cyan' : 'gray'
  const progressValue = scanActive ? 48 : 100
  const scanTitle = scanActive ? 'Indexing configured directories' : 'No active scan'
  const scanSubtitle = scanActive ? '2 of 4 directories' : 'Last run completed today'
  const scanDetail = scanActive ? 'Scanning C:/Media/2025 · 1,248 files indexed' : '18,426 files indexed · 4 files could not be read'

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Activity"
        subtitle="Explore activity across your indexed media library."
      />
      <div className="activity-page">
        <div className="activity-heading">
          <div>
            <Text className="eyebrow">ACTIVITY</Text>
            <h2>Scan activity</h2>
            <Text c="dimmed" size="sm">
              Monitor current and previous indexing runs.
            </Text>
          </div>
          <Badge color={badgeColor}>{scanActive ? 'Running' : 'Complete'}</Badge>
        </div>
        <Card className="scan-progress-card">
          <Group justify="space-between">
            <div>
              <Text className="eyebrow">CURRENT SCAN</Text>
              <h3>{scanTitle}</h3>
            </div>
            <Text size="sm" c={scanActive ? 'cyan' : 'dimmed'}>
              {scanSubtitle}
            </Text>
          </Group>
          <Progress value={progressValue} color="cyan" mt="md" />
          <Text size="xs" c="dimmed" mt="sm">
            {scanDetail}
          </Text>
        </Card>
        <Card>
          <Text className="eyebrow">EVENT LOG</Text>
          <h3>Recent events</h3>
          <div className="activity-log">
            {logs.map((log, index) => (
              <div className="activity-log-row" key={`${log.time}-${index}`}>
                <Text size="xs" c="dimmed">
                  {log.time}
                </Text>
                <div>
                  <Text size="sm">{log.event}</Text>
                  <Text size="xs" c="dimmed">
                    {log.directory}
                  </Text>
                </div>
                <Badge variant="light" color={log.status === 'Warning' ? 'orange' : log.status === 'Running' ? 'cyan' : 'gray'}>
                  {log.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create `app/routes/activity.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { ActivityPage } from '../features/activity/ActivityPage'

export const Route = createFileRoute('/activity')({
  component: ActivityPage,
})
```

- [ ] **Step 3: Add activity styles to `app/styles.css`**

```css
.activity-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.activity-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.activity-page h3 {
  margin: 4px 0 0;
  font-size: 15px;
}

.scan-progress-card {
  border-color: #18c7d8;
}

.activity-log {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
}

.activity-log-row {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 11px 0;
  border-top: 1px solid #2a323d;
}

.activity-log-row > div {
  min-width: 0;
}

@media (max-width: 700px) {
  .activity-log-row {
    grid-template-columns: 1fr auto;
  }
  .activity-log-row > .mantine-Text-root {
    grid-column: 1 / -1;
  }
}
```

- [ ] **Step 4: Add smoke test**

`app/features/activity/ActivityPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from '@tanstack/react-router'
import { MantineProvider } from '@mantine/core'
import { AppProvider } from '../../lib/app-context'
import { ActivityPage } from './ActivityPage'

describe('ActivityPage', () => {
  it('renders current scan and event log', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <MemoryRouter>
          <AppProvider>
            <ActivityPage />
          </AppProvider>
        </MemoryRouter>
      </MantineProvider>,
    )
    expect(screen.getByText('No active scan')).toBeInTheDocument()
    expect(screen.getByText('Scan completed')).toBeInTheDocument()
    expect(screen.getByText('Permission denied')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run tests and check; visual verification — scan flow**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Then `pnpm dev`, click **Scan library** on `/` → should navigate to `/activity`, badge flips to `Running`, progress shows 48, log prepends `Scan started / Enabled directories / Running`. Verify URL in address bar is `/activity`.

- [ ] **Step 6: Commit**

```bash
git add app/features/activity app/routes/activity.tsx app/styles.css
git commit -m "feat: add Activity feature with scan progress card"
```

## Task 12: Preferences feature + route

**Files:**
- Create: `app/features/preferences/PreferencesPage.tsx`
- Modify: `app/routes/preferences.tsx`
- Modify: `app/styles.css` (preferences styles)

**Interfaces:**
- Consumes: `preferences` defaults from `app/lib/mock-data`.
- Produces: `export function PreferencesPage(): ReactElement` — two tabs (Application configuration / Directories), in-memory state, add/remove flows with the prototype's exact validation messages.

Note on tab switching: the prototype hides panels via CSS `[data-active-tab]`. Per the spec decision, use conditional render (spec §8/Preferences) instead of the CSS-hiding.

- [ ] **Step 1: Create `app/features/preferences/PreferencesPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Badge, Button, Card, Checkbox, Group, Switch, Tabs, Text, TextInput } from '@mantine/core'
import { FolderOpen, ShieldCheck } from 'lucide-react'
import { PageHeading } from '../../components/common/PageHeading'
import { preferences as defaultPreferences } from '../../lib/mock-data'

type IndexedRow = { path: string; enabled: boolean; lastScan: string; files: string }

export function PreferencesPage() {
  const [indexed, setIndexed] = useState<IndexedRow[]>(defaultPreferences.indexed)
  const [ignored, setIgnored] = useState<string[]>(defaultPreferences.ignored)
  const [indexedPath, setIndexedPath] = useState('')
  const [ignoredPath, setIgnoredPath] = useState('')
  const [message, setMessage] = useState('')
  const [databaseName, setDatabaseName] = useState(defaultPreferences.databaseName)
  const [extensions, setExtensions] = useState(defaultPreferences.extensions)
  const [processDirectories, setProcessDirectories] = useState(true)
  const [updateRecords, setUpdateRecords] = useState(true)
  const [resyncDirectories, setResyncDirectories] = useState(false)
  const [verifyFiles, setVerifyFiles] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('application')

  const activeCount = useMemo(() => indexed.filter((item) => item.enabled).length, [indexed])

  const resetDefaults = () => {
    setDatabaseName(defaultPreferences.databaseName)
    setExtensions(defaultPreferences.extensions)
    setProcessDirectories(true)
    setUpdateRecords(true)
    setResyncDirectories(false)
    setVerifyFiles(false)
    setSaved(false)
  }

  const addIndexed = () => {
    const path = indexedPath.trim()
    if (!path) {
      setMessage('Enter an indexed directory path first.')
      return
    }
    if (indexed.some((item) => item.path === path) || ignored.includes(path)) {
      setMessage('That directory is already configured.')
      return
    }
    setIndexed((items) => [...items, { path, enabled: true, lastScan: 'Not scanned yet', files: '—' }])
    setIndexedPath('')
    setMessage('Indexed directory added.')
  }

  const addIgnored = () => {
    const path = ignoredPath.trim()
    if (!path) {
      setMessage('Enter an ignored directory path first.')
      return
    }
    if (indexed.some((item) => item.path === path) || ignored.includes(path)) {
      setMessage('That directory is already configured.')
      return
    }
    setIgnored((items) => [...items, path])
    setIgnoredPath('')
    setMessage('Ignored directory added.')
  }

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Preferences"
        subtitle="Explore preferences across your indexed media library."
      />
      <div className="preferences-page">
        <div className="preferences-intro">
          <div>
            <Text className="eyebrow">PREFERENCES</Text>
            <h2>Library indexing</h2>
            <Text c="dimmed" size="sm">
              Configure application behavior and directory scope.
            </Text>
          </div>
        </div>
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value ?? 'application')} className="preferences-tabs">
          <Tabs.List>
            <Tabs.Tab value="application">Application configuration</Tabs.Tab>
            <Tabs.Tab value="directories">Directories</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {activeTab === 'directories' && (
          <>
            <Card className="directories-panel">
              <Group justify="space-between" mb="md">
                <div>
                  <Text className="eyebrow">INDEXED DIRECTORIES</Text>
                  <h3>Directories included in scans</h3>
                </div>
                <Badge color="cyan">{activeCount} active</Badge>
              </Group>
              <Group align="flex-end" mb="md">
                <TextInput
                  className="directory-add-input"
                  label="Add indexed directory"
                  placeholder="C:/Media/Projects"
                  value={indexedPath}
                  onChange={(event) => setIndexedPath(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addIndexed()
                  }}
                />
                <Button onClick={addIndexed}>Add directory</Button>
              </Group>
              <div className="preference-list">
                {indexed.map((item) => (
                  <div className="preference-row" key={item.path}>
                    <Checkbox
                      checked={item.enabled}
                      onChange={() =>
                        setIndexed((items) => items.map((current) => (current.path === item.path ? { ...current, enabled: !current.enabled } : current)))
                      }
                      aria-label={`Enable ${item.path}`}
                    />
                    <FolderOpen size={16} />
                    <div className="preference-path">
                      <Text size="sm">{item.path}</Text>
                      <Text size="xs" c="dimmed">
                        {item.files} files · Last scan {item.lastScan}
                      </Text>
                    </div>
                    <Button variant="subtle" size="xs" color="red" onClick={() => setIndexed((items) => items.filter((current) => current.path !== item.path))}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="directories-panel">
              <Group justify="space-between" mb="md">
                <div>
                  <Text className="eyebrow">GLOBALLY IGNORED DIRECTORIES</Text>
                  <h3>Excluded from every scan</h3>
                </div>
                <Badge variant="light">{ignored.length} ignored</Badge>
              </Group>
              <Text size="xs" c="orange" mb="md">
                Ignored directories always take precedence over indexed directories.
              </Text>
              <Group align="flex-end" mb="md">
                <TextInput
                  className="directory-add-input"
                  label="Add globally ignored directory"
                  placeholder="C:/Media/Projects/Cache"
                  value={ignoredPath}
                  onChange={(event) => setIgnoredPath(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addIgnored()
                  }}
                />
                <Button onClick={addIgnored}>Add directory</Button>
              </Group>
              <div className="preference-list">
                {ignored.map((path) => (
                  <div className="preference-row" key={path}>
                    <ShieldCheck size={16} />
                    <div className="preference-path">
                      <Text size="sm">{path}</Text>
                      <Text size="xs" c="dimmed">
                        Global exclusion
                      </Text>
                    </div>
                    <Button variant="subtle" size="xs" color="red" onClick={() => setIgnored((items) => items.filter((item) => item !== path))}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {activeTab === 'application' && (
          <Card className="indexing-settings-card application-panel">
            <Group justify="space-between" mb="md">
              <div>
                <Text className="eyebrow">INDEXING SETTINGS</Text>
                <h3>Application configuration</h3>
              </div>
              {saved && (
                <Badge color="cyan">Saved</Badge>
              )}
            </Group>
            <div className="settings-grid">
              <TextInput
                label="Local database name"
                description="SQLite database used to store indexed file metadata."
                value={databaseName}
                onChange={(event) => {
                  setDatabaseName(event.currentTarget.value)
                  setSaved(false)
                }}
              />
              <TextInput
                label="File extensions"
                description="Comma-separated extensions to include."
                value={extensions}
                onChange={(event) => {
                  setExtensions(event.currentTarget.value)
                  setSaved(false)
                }}
              />
            </div>
            <div className="settings-options">
              <div className="setting-row">
                <div>
                  <Text size="sm">Process configured directories</Text>
                  <Text size="xs" c="dimmed">
                    Scan and index files from enabled directories.
                  </Text>
                </div>
                <Switch checked={processDirectories} onChange={(event) => setProcessDirectories(event.currentTarget.checked)} aria-label="Process configured directories" />
              </div>
              <div className="setting-row">
                <div>
                  <Text size="sm">Update duplicate records</Text>
                  <Text size="xs" c="dimmed">
                    Rebuild the duplicate summary after indexing.
                  </Text>
                </div>
                <Switch checked={updateRecords} onChange={(event) => setUpdateRecords(event.currentTarget.checked)} aria-label="Update duplicate records" />
              </div>
              <div className="setting-row">
                <div>
                  <Text size="sm">Resync directories</Text>
                  <Text size="xs" c="dimmed">
                    Remove entries for files that no longer exist or moved outside the app.
                  </Text>
                </div>
                <Switch
                  checked={resyncDirectories}
                  onChange={(event) => {
                    setResyncDirectories(event.currentTarget.checked)
                    if (!event.currentTarget.checked) setVerifyFiles(false)
                  }}
                  aria-label="Resync directories"
                />
              </div>
              {resyncDirectories && (
                <div className="setting-row">
                  <div>
                    <Text size="sm">Verify actual files</Text>
                    <Text size="xs" c="dimmed">
                      Check each stored entry directly against the filesystem. More accurate, but slower.
                    </Text>
                  </div>
                  <Switch checked={verifyFiles} onChange={(event) => setVerifyFiles(event.currentTarget.checked)} aria-label="Verify actual files" />
                </div>
              )}
            </div>
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={resetDefaults}>
                Reset to defaults
              </Button>
              <Button color="cyan" onClick={() => setSaved(true)}>
                Save preferences
              </Button>
            </Group>
          </Card>
        )}

        {message && (
          <Text size="xs" c="orange">
            {message}
          </Text>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create `app/routes/preferences.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { PreferencesPage } from '../features/preferences/PreferencesPage'

export const Route = createFileRoute('/preferences')({
  component: PreferencesPage,
})
```

- [ ] **Step 3: Add preferences styles to `app/styles.css`**

```css
.preferences-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preferences-tabs {
  margin-top: -4px;
}

.preferences-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.preferences-page h3 {
  margin: 4px 0 0;
  font-size: 15px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-options {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 16px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-top: 1px solid #2a323d;
}

.setting-row > div {
  min-width: 0;
}

.preference-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preference-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 5px 8px;
  border: 1px solid #2a323d;
  border-radius: 6px;
}

.preference-row:hover {
  background: #1d232c;
}

.preference-path {
  min-width: 0;
  flex: 1;
}

.preference-path .mantine-Text-root:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.preference-path .mantine-Text-root:nth-child(2) {
  font-size: 11px;
  line-height: 1.25;
}

.preferences-page .mantine-TextInput-root {
  min-width: 260px;
  flex: 1;
}

.directory-add-input {
  max-width: 520px;
}

@media (max-width: 800px) {
  .preferences-intro {
    flex-direction: column;
  }
  .preferences-page .mantine-Group-root {
    align-items: stretch;
    flex-direction: column;
  }
  .preferences-page .mantine-Select-root,
  .preferences-page .mantine-TextInput-root {
    min-width: 0;
    width: 100%;
  }
  .settings-grid {
    grid-template-columns: 1fr;
  }
  .setting-row {
    align-items: flex-start;
  }
  .preference-row {
    min-height: 44px;
    padding: 7px 8px;
  }
}
```

- [ ] **Step 4: Add smoke test**

`app/features/preferences/PreferencesPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from '@tanstack/react-router'
import { MantineProvider } from '@mantine/core'
import { AppProvider } from '../../lib/app-context'
import { PreferencesPage } from './PreferencesPage'

describe('PreferencesPage', () => {
  it('renders application config tab by default', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <MemoryRouter>
          <AppProvider>
            <PreferencesPage />
          </AppProvider>
        </MemoryRouter>
      </MantineProvider>,
    )
    expect(screen.getByText('Application configuration')).toBeInTheDocument()
    expect(screen.getByLabelText('Local database name')).toBeInTheDocument()
  })

  it('switches to directories tab', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <MemoryRouter>
          <AppProvider>
            <PreferencesPage />
          </AppProvider>
        </MemoryRouter>
      </MantineProvider>,
    )
    screen.getByRole('tab', { name: 'Directories' }).click()
    expect(screen.getByText('Directories included in scans')).toBeInTheDocument()
    expect(screen.getByText('C:/Media/2025')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run tests and check; visual verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Then `pnpm dev` at `/preferences`. Verify both tabs, add/remove flows, duplicate-path validation message (`That directory is already configured.`), `Saved` badge, `Reset to defaults` behavior, and that the conditional `Verify actual files` switch appears only when `Resync directories` is on.

- [ ] **Step 6: Commit**

```bash
git add app/features/preferences app/routes/preferences.tsx app/styles.css
git commit -m "feat: add Preferences feature with tabs and directory management"
```

## Task 13: Final integration, theme tokens, and verification

**Files:**
- Modify: `app/routes/__root.tsx` (wrap shell in `MantineProvider` with the prototype theme; import `@mantine/core/styles.css`)
- Modify: `app/styles.css` (remaining prototype rules: brand tokens, tag/general rules not yet added, responsive tweaks)
- Modify: `.prettierignore` if needed

**Interfaces:**
- Consumes: nothing new.
- Produces: the final theme object matching the prototype's `createTheme` call, mounted in the root route so every route and the shared drawer are styled consistently.

- [ ] **Step 1: Update `app/routes/__root.tsx` with the prototype theme + Mantine**

There is no `main.tsx` (see Task 1 bootstrap note); the `MantineProvider` wraps the shell inside the existing `RootDocument`. Also add `import '@mantine/core/styles.css'` as the first import of this file (CSS order: Mantine base, then `./styles.css`).

```tsx
import '@mantine/core/styles.css'
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { MantineProvider, createTheme } from '@mantine/core'
import '../styles.css'
import { AppProvider } from '../lib/app-context'
import { Sidebar } from '../components/common/Sidebar'
import { AppHeader } from '../components/common/AppHeader'
import { AppFooter } from '../components/common/AppFooter'
import { FilePreviewDrawer } from '../components/common/FilePreviewDrawer'

const theme = createTheme({
  primaryColor: 'cyan',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  headings: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  defaultRadius: 'md',
  colors: {
    cyan: ['#e1fbff', '#baf3fa', '#82e9f2', '#48dbe8', '#18c7d8', '#08aabc', '#07899b', '#086d7d', '#0b5967', '#0e4651'],
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'imgsorter' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <AppProvider>
            <div className="app-shell">
              <Sidebar />
              <main>
                <AppHeader />
                <section className="content">
                  {children}
                </section>
                <AppFooter />
              </main>
            </div>
            <FilePreviewDrawer />
          </AppProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  )
}
```

Note: this file applies Tasks 4/5 code too (it replaces the Task 4 version); the only additions vs. Task 4 are the Mantine import + `MantineProvider`/`theme` and the `FilePreviewDrawer` line carried over.

- [ ] **Step 2: Add remaining prototype CSS**

Append these to `app/styles.css` (they were not covered by earlier tasks; copy values verbatim):

```css
:root {
  --background: #101318;
  --card: #171b22;
  --card-2: #1d232c;
  --primary: #18c7d8;
  --muted: #8d98a8;
  --border: #2a323d;
  --text: #edf3f7;
  --orange: #f5a34a;
}

.run-list svg,
.mantine-Text-root svg {
  vertical-align: middle;
  margin-right: 6px;
}

.file-row img {
  width: 38px;
  height: 38px;
  object-fit: cover;
  border-radius: 5px;
}
```

- [ ] **Step 3: No full-router unit test (rationale)**

Rendering the full TanStack Start route tree in jsdom requires the SSR pipeline (`renderStream`/`renderToString`), which is out of scope for Phase 1's smoke tests. Coverage already ships as Task-level component render tests (Tasks 4–12), each rendering the feature page within `MantineProvider` + `AppProvider` + `MemoryRouter`. Do NOT add a hydrating-router test in this phase.

- [ ] **Step 4: Full manual parity walkthrough**

Run: `pnpm dev` and click through every route, comparing against the prototype at `C:\dev\repos\imgsorter-ui-v1` (`pnpm dev` in that repo on port 5173, or the built `dist/`):

1. `/` Overview — 6 metrics, storage map, last-run steps, at-a-glance, "View analytics" navigates.
2. `/duplicates` — groups collapse/expand, keepers persist across navigation, drawer opens via filename/Preview, badges/messages match.
3. `/unique-files` — table with Actions column; header search/dir/ext URL params appear in the address bar and survive reload.
4. `/analytics` — ranking tables + independent pagination.
5. `/browse` — directory tree filters; `selectedDirs` in URL; shared global filters compose.
6. `/activity` — idle state; then Scan library → Running state + new log entry.
7. `/preferences` — tabs, add/remove, reset, saved states.
8. Drawer opens from Duplicates, Files, Browse with correct metadata.

- [ ] **Step 5: Run full check suite**

Run: `pnpm check && pnpm build`
Expected: typecheck, lint, tests, and format all pass; production build emits to `dist/`.

- [ ] **Step 6: Compare screenshots (optional but recommended)**

Take screenshots of the prototype build and this app side by side for each view; confirm spacing, colors, and copy match (per spec §10 visual verification).

- [ ] **Step 7: Commit**

```bash
git add app/routes/__root.tsx app/styles.css
git commit -m "chore: apply prototype theme tokens and finalize integration"
```

## Self-Review Checklist (run after writing; also run before execution begins)

1. **Spec coverage:**
   - §5 structure → Tasks 1–12 create every file listed (Sidebar, AppHeader, AppFooter, FilePreviewDrawer, FilterBar → implemented as per-feature filter groups handled inside Features; PaginationControls → implemented inline in AnalyticsPage; DirectoryTree ✓; all feature pages ✓; lib ✓; routes ✓). **One documented deviation:** spec listed `app/main.tsx` as entry; the installed TanStack Start plugin (verified running in `tanstack-start-playground`) has no client entry — entry comes from `app/router.tsx` (`getRouter`) + `__root.tsx` (`shellComponent`). Theme lands in `__root.tsx` (Task 13).
   - §6 data model + mock data → Task 2 (parity via `mock-data.test.ts`).
   - §7 shell + cross-page state → Tasks 3–5; search-param gating with `filter-sync.ts` honors Decision 1 (`selectedDirs` Browse-only) and Decision 4 (params only on the 3 routes).
   - §8 features → Tasks 6–12 (Overview, Duplicates incl. KeepToggle-only-in-Duplicates per Decision 2, Files, Browse, Analytics, Activity, Preferences with conditional tab render).
   - §9 error handling → Preferences local validation (Task 12).
   - §10 testing/verification → per-task smoke tests + Task 13 parity walkthrough; `pnpm check` gates each task.
   - §11 non-goals honored: no server/, no engine, no persistence, no handlers on Reveal/Open-file/Export.

2. **Placeholder scan:** Every task has full code; no TBD/TODO; commands include expected output.

3. **Type consistency:**
   - `formatBytes` defined Task 2, used Tasks 4–11 ✓.
   - `useApp` shape defined Task 3 (query/dir/ext/selectedDirs/setSelectedDirs/toggleSelectedDir/filtered/selectedFile/setSelectedFile/scanActive/logs/startScan/keepers/toggleKeeper/setKeepers) — consumed consistently across Tasks 4–11 ✓. `setSelectedDirs` added so `useSelectedDirsSearchParams` can restore selection from the URL on load ✓.
   - `applyFilters` signature `(input, query, dir, ext, selectedDirs)` matches `filter-pipeline.test.ts` ✓.
   - `useFilterSearchParams` introduced Task 7, extended Task 8; `useSelectedDirsSearchParams` used only in `browse.tsx` ✓.
   - `FilesTable` `unique` prop used only in FilesPage ✓; Browse omits it ✓.
   - `FilesPage` reused by `/unique-files`; Browse uses `FilesTable` directly inside `BrowsePage` (NOT `FilesPage`) to control the heading — consistent with the spec's "shared by Unique Files + Browse" intent (component-level sharing).