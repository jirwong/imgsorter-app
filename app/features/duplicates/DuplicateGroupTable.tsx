import { Fragment, useMemo, useState } from 'react';
import { Badge, Button, Group, Table, Text } from '@mantine/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatBytes } from '../../lib/format';
import type { DuplicateGroup, Entry } from '../../lib/types';
import { KeepToggle } from './KeepToggle';

export type DuplicateGroupTableProps = {
  groups: DuplicateGroup[];
  keepers: number[];
  onToggleKeeper: (id: number) => void;
  onSelect: (e: Entry) => void;
};

export function DuplicateGroupTable({ groups, keepers, onToggleKeeper, onSelect }: DuplicateGroupTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'count' | 'name' | 'redundant'>('count');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(
    () =>
      [...groups].sort((a, b) => {
        const av = sortKey === 'count' ? a.count : sortKey === 'redundant' ? parseFloat(a.space) : a.name;
        const bv = sortKey === 'count' ? b.count : sortKey === 'redundant' ? parseFloat(b.space) : b.name;
        const result =
          typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return direction === 'asc' ? result : -result;
      }),
    [groups, sortKey, direction],
  );

  const headerClick = (key: 'count' | 'name' | 'redundant') => {
    if (sortKey === key) {
      setDirection((v) => (v === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection(key === 'name' ? 'asc' : 'desc');
    }
  };

  const arrow = (key: 'count' | 'name' | 'redundant') => (sortKey === key ? (direction === 'asc' ? '↑' : '↓') : '');

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
                    <span className="chevron">
                      {expanded === g.hash ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
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
  );
}
