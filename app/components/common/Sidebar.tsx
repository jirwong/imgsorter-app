import { Badge, Button, Group, Progress, Text, ThemeIcon } from '@mantine/core';
import {
  Activity,
  Archive,
  BarChart3,
  FileImage,
  FolderTree,
  LayoutGrid,
  Settings2,
  Sparkles,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { Link, useLoaderData, useRouter } from '@tanstack/react-router';
import { startScan, useScanStatus } from '../../lib/scan-store';
import { formatBytes } from '../../lib/format';

const navItems: { label: string; to: string; icon: LucideIcon }[] = [
  { label: 'Overview', to: '/', icon: BarChart3 },
  { label: 'Duplicates', to: '/duplicates', icon: Archive },
  { label: 'Unique Files', to: '/unique-files', icon: Sparkles },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { label: 'Browse', to: '/browse', icon: LayoutGrid },
  { label: 'Directories', to: '/directories', icon: FolderTree },
  { label: 'Activity', to: '/activity', icon: Activity },
];

export function Sidebar() {
  const router = useRouter();
  const { files, size, duplicateGroups } = useLoaderData({ from: '__root__' });
  const scan = useScanStatus();

  const running = scan.status === 'running';
  const percent =
    running && scan.totalFiles ? Math.round((scan.filesProcessed / scan.totalFiles) * 100) : running ? 0 : 100;

  const handleScan = () => {
    void startScan();
    router.navigate({ to: '/activity' as string });
  };

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
            {running ? 'INDEXING' : 'INDEXING COMPLETE'}
          </Text>
          <Text size="xs" c="cyan">
            {percent}%
          </Text>
        </Group>
        <Progress value={percent} color="cyan" size="xs" mt={7} />
        <Text size="xs" c="dimmed" mt={8}>
          {files.toLocaleString('en-US')} files · {formatBytes(size)}
        </Text>
      </div>
      <nav>
        {navItems.map(({ label, to, icon: Icon }) => (
          <Link key={label} to={to} activeProps={{ className: 'active' }}>
            <Icon size={17} />
            {label}
            {label === 'Duplicates' && (
              <Badge size="xs" color="orange">
                {duplicateGroups}
              </Badge>
            )}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link to={'/preferences' as string} activeProps={{ className: 'active' }}>
          <Settings2 size={16} />
          Preferences
        </Link>
      </div>
    </aside>
  );
}
