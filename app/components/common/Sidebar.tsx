import { Badge, Button, Group, Progress, Text, ThemeIcon } from '@mantine/core';
import {
  Activity,
  Archive,
  BarChart3,
  FileImage,
  LayoutGrid,
  Settings2,
  Sparkles,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { Link, useRouter } from '@tanstack/react-router';
import { useApp } from '../../lib/app-context';

const navItems: { label: string; to: string; icon: LucideIcon }[] = [
  { label: 'Overview', to: '/', icon: BarChart3 },
  { label: 'Duplicates', to: '/duplicates', icon: Archive },
  { label: 'Unique Files', to: '/unique-files', icon: Sparkles },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { label: 'Browse', to: '/browse', icon: LayoutGrid },
  { label: 'Activity', to: '/activity', icon: Activity },
];

export function Sidebar() {
  const { startScan } = useApp();
  const router = useRouter();

  const handleScan = () => {
    startScan();
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
          <Link key={label} to={to} activeProps={{ className: 'active' }}>
            <Icon size={17} />
            {label}
            {label === 'Duplicates' && (
              <Badge size="xs" color="orange">
                3
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
