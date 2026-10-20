import { Fragment, useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Group, Table, Text } from '@mantine/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatBytes } from '../../lib/format';
import type { DuplicateGroup, DuplicatesQuery, Entry } from '../../lib/types';
import { KeepToggle } from './KeepToggle';

export type DuplicateGroupTableProps = {
  groups: DuplicateGroup[];
  keeperByGroup: Record<string, number>;
  sortKey: DuplicatesQuery['sortKey'];
  direction: DuplicatesQuery['direction'];
  onSortChange: (sortKey: DuplicatesQuery['sortKey'], direction: DuplicatesQuery['direction']) => void;
  onToggleKeeper: (groupKey: string, id: number) => void;
  onSelect: (e: Entry) => void;
  isHidden: (e: Entry) => boolean;
  onHide: (e: Entry) => void;
  onUnhide: (e: Entry) => void;
  selected: Set<number>;
  onToggleMany: (ids: number[]) => void;
};

export function DuplicateGroupTable({
  groups,
  keeperByGroup,
  sortKey,
  direction,
  onSortChange,
  onToggleKeeper,
  onSelect,
  isHidden,
  onHide,
  onUnhide,
  selected,
  onToggleMany,
}: DuplicateGroupTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const headerClick = (key: DuplicatesQuery['sortKey']) => {
    const next = sortKey === key ? (direction === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc';
    onSortChange(key, next);
  };

  const arrow = (key: DuplicatesQuery['sortKey']) => (sortKey === key ? (direction === 'asc' ? '↑' : '↓') : '');

  const allIds = useMemo(() => groups.flatMap((g) => g.files.map((e) => e.id)), [groups]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = allIds.some((id) => selected.has(id));

  return (
    <div className="duplicate-table-wrap">
      <Table className="duplicate-table" verticalSpacing="xs" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={40}>
              <Checkbox
                aria-label="Select all visible files"
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onChange={() => onToggleMany(allIds)}
              />
            </Table.Th>
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
          {groups.map((g) => {
            const ids = g.files.map((e) => e.id);
            const groupAll = ids.length > 0 && ids.every((id) => selected.has(id));
            const groupSome = ids.some((id) => selected.has(id));
            return (
              <Fragment key={g.key}>
                <Table.Tr className="group-row" onClick={() => setExpanded(expanded === g.key ? null : g.key)}>
                  <Table.Td>
                    <Checkbox
                      aria-label={`Select group ${g.name}`}
                      checked={groupAll}
                      indeterminate={groupSome && !groupAll}
                      onChange={() => onToggleMany(ids)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <span className="chevron">
                        {expanded === g.key ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
                      {g.hash} · {formatBytes(g.redundantSpace)} redundant
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {g.files.length} visible
                    </Text>
                  </Table.Td>
                </Table.Tr>
                {expanded === g.key &&
                  g.files.map((e) => (
                    <Table.Tr key={e.id} className={keeperByGroup[g.key] === e.id ? 'keeper-row' : ''}>
                      <Table.Td>
                        <Checkbox
                          aria-label={`Select ${e.path}`}
                          checked={selected.has(e.id)}
                          onChange={() => onToggleMany([e.id])}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          ↳
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text
                            size="xs"
                            className="mono file-name-cell"
                            title={e.filename}
                            onClick={() => onSelect(e)}
                          >
                            {e.filename}
                          </Text>
                          {isHidden(e) && (
                            <Badge size="xs" variant="light" color="gray">
                              Hidden
                            </Badge>
                          )}
                        </Group>
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
                          <KeepToggle
                            keeper={keeperByGroup[g.key] === e.id}
                            onToggle={() => onToggleKeeper(g.key, e.id)}
                          />
                          <Button size="compact-xs" variant="subtle" onClick={() => onSelect(e)}>
                            Preview
                          </Button>
                          {isHidden(e) ? (
                            <Button size="compact-xs" variant="subtle" onClick={() => onUnhide(e)}>
                              Unhide
                            </Button>
                          ) : (
                            <Button size="compact-xs" variant="subtle" onClick={() => onHide(e)}>
                              Hide
                            </Button>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
              </Fragment>
            );
          })}
        </Table.Tbody>
      </Table>
    </div>
  );
}
