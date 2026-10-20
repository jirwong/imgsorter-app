export const ROOT_LABELS = [
  { prefix: '@fixtures/Media/2025', label: 'C:/Media/2025' },
  { prefix: '@fixtures/Media/2024', label: 'C:/Media/2024' },
  { prefix: '@fixtures/Camera Imports', label: 'D:/Camera Imports' },
] as const;

export function mapPathToDisplay(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  for (const { prefix, label } of ROOT_LABELS) {
    if (lower.startsWith(prefix.toLowerCase())) {
      return label + normalized.slice(prefix.length);
    }
  }
  return normalized;
}

export function rootLabelOf(mappedPath: string): string {
  const lower = mappedPath.toLowerCase();
  for (const { label } of ROOT_LABELS) {
    if (lower.startsWith(label.toLowerCase())) return label;
  }
  const first = mappedPath.split('/')[0] ?? mappedPath;
  return first;
}

type StorageMapping = { pattern: string; prefix: string };

const STORAGE_MAPPINGS: StorageMapping[] = ROOT_LABELS.flatMap(({ prefix, label }) => {
  const labelSegments = label.split('/');
  const prefixSegments = prefix.split('/');
  return labelSegments.slice(1).map((_, index) => {
    const depth = index + 2;
    return {
      pattern: labelSegments.slice(0, depth).join('/').toLowerCase(),
      prefix: prefixSegments.slice(0, depth).join('/'),
    };
  });
}).sort((a, b) => b.pattern.length - a.pattern.length);

export function toStoragePath(displayPath: string): string {
  const normalized = displayPath.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  for (const { pattern, prefix } of STORAGE_MAPPINGS) {
    if (lower === pattern || lower.startsWith(`${pattern}/`)) {
      return prefix + normalized.slice(pattern.length);
    }
  }
  return normalized;
}

export function toStorageRoots(roots: string[]): string[] {
  return roots.map(toStoragePath);
}
