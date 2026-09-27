"use client";

import React, { useState } from 'react';
import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Tooltip, Tabs, Tab } from '@heroui/react';
import { Plus, RotateCw, ArrowDownWideNarrow, Rows2, Rows4, ListFilter } from 'lucide-react';
import type { CallSortMode } from '@/lib/callSort';
import type { DispatchZone } from '@/app/types';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';

// Toolbar controls for the dispatch page. These used to be declared inside
// DispatchPage's render body, which gave React a brand-new component type on
// every render — so every Firestore snapshot unmounted/remounted them and
// could close an open dropdown mid-interaction. Keep them at module scope.

export type TeamSortMode = 'availability' | 'asc' | 'desc';
export type CardViewMode = 'normal' | 'condensed';
export type LeftPanelTab = 'teams' | 'supervisors' | 'equipment';

const SORT_MENU_CLASSNAMES = { content: 'min-w-[140px] w-[140px] max-w-[140px]' };
const selectedItemClass = (selected: boolean) => (selected ? 'bg-surface-liner' : '');

// Sort control for the Calls list — same circular icon-button treatment as
// TeamActionButtonGroup's sort dropdown. On mobile it's sized up (larger
// radius + icon) to match how the adjacent Add Call pill also grows there.
export function CallSortButton({
  large,
  sortMode,
  onSortModeChange,
}: {
  large?: boolean;
  sortMode: CallSortMode;
  onSortModeChange: (mode: CallSortMode) => void;
}) {
  const { t } = useDispatchTerms();
  const options: { key: CallSortMode; label: string }[] = [
    { key: 'newest', label: t('Newest') },
    { key: 'oldest', label: t('Oldest') },
    { key: 'pending', label: t('Pending') },
  ];
  return (
    <Tooltip content={t('Sort calls')} placement="top">
      <div>
        <Dropdown classNames={SORT_MENU_CLASSNAMES}>
          <DropdownTrigger>
            <Button
              isIconOnly
              size={large ? 'md' : 'sm'}
              variant="flat"
              className={`rounded-full bg-surface-deep border border-surface-liner hover:bg-surface-liner ${large ? 'h-10 w-10 min-w-10' : ''}`}
              aria-label={t('Sort calls')}
            >
              <ArrowDownWideNarrow className={large ? 'h-6 w-6' : 'h-5 w-5'} />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label={t('Sort calls')}>
            {options.map(({ key, label }) => (
              <DropdownItem key={key} onClick={() => onSortModeChange(key)} className={selectedItemClass(sortMode === key)}>
                {label}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      </div>
    </Tooltip>
  );
}

// One dropdown that both switches which zone's calls the table shows and
// multi-selects across zones. "All Calls" is exclusive with every zone —
// picking it clears any zone selection (and the zones read as disabled while
// it's active); picking a zone drops "All Calls" and multi-selects normally.
// `onSelectionChange` returns true when the menu should close (i.e. "All
// Calls" was picked), same as if the user had clicked away.
export function CallZoneFilterButton({
  label,
  zones,
  selection,
  onSelectionChange,
}: {
  label: string;
  zones: DispatchZone[];
  selection: Set<string>;
  onSelectionChange: (keys: 'all' | Iterable<React.Key>) => boolean;
}) {
  const { t } = useDispatchTerms();
  const [isOpen, setIsOpen] = useState(false);
  const allSelected = selection.has('all');
  return (
    <Tooltip content={t('Filter by zone')} placement="top">
      <div>
        <Dropdown classNames={{ content: 'min-w-[180px]' }} isOpen={isOpen} onOpenChange={setIsOpen}>
          <DropdownTrigger>
            <Button
              size="sm"
              variant="flat"
              className="rounded-full bg-surface-deep border border-surface-liner hover:bg-surface-liner px-3 gap-1.5 max-w-[220px]"
              aria-label={t('Filter by zone')}
            >
              <ListFilter className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label={t('Filter by zone')}
            selectionMode="multiple"
            closeOnSelect={false}
            selectedKeys={selection}
            onSelectionChange={(keys) => {
              if (onSelectionChange(keys)) setIsOpen(false);
            }}
          >
            <DropdownItem key="all" className={allSelected ? 'font-semibold' : ''}>
              {t('All Calls')}
            </DropdownItem>
            <>
              {zones.map((zone) => (
                <DropdownItem key={zone.id} className={allSelected ? 'opacity-50' : ''}>
                  {zone.name}
                </DropdownItem>
              ))}
            </>
          </DropdownMenu>
        </Dropdown>
      </div>
    </Tooltip>
  );
}

export function TeamActionButtonGroup({
  selectedTab,
  onAddTeam,
  onAddSupervisor,
  onAddEquipment,
  onRefreshPosts,
  hasPostingTimes,
  cardViewMode,
  onCardViewModeChange,
  teamSortMode,
  onTeamSortModeChange,
}: {
  selectedTab: LeftPanelTab;
  onAddTeam: () => void;
  onAddSupervisor: () => void;
  onAddEquipment: () => void;
  onRefreshPosts: () => void;
  hasPostingTimes: boolean;
  cardViewMode: CardViewMode;
  onCardViewModeChange: (mode: CardViewMode) => void;
  teamSortMode: TeamSortMode;
  onTeamSortModeChange: (mode: TeamSortMode) => void;
}) {
  const { t } = useDispatchTerms();
  const addLabel =
    selectedTab === 'teams' ? t('Add Team') : selectedTab === 'supervisors' ? t('Add Supervisor') : t('Add Equipment');
  const sortOptions: { key: TeamSortMode; label: string }[] = [
    { key: 'asc', label: 'Ascending' },
    { key: 'desc', label: 'Descending' },
    { key: 'availability', label: 'Availability' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-surface-deep border border-surface-liner">
      <Tooltip content={addLabel} placement="top">
        <div>
          <Dropdown>
            <DropdownTrigger>
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                className="rounded-full bg-transparent hover:bg-surface-liner"
                aria-label="Add Team or Supervisor"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Team Actions"
              onAction={(key) => {
                if (key === 'team') onAddTeam();
                else if (key === 'supervisor') onAddSupervisor();
                else if (key === 'equipment') onAddEquipment();
              }}
            >
              <DropdownItem key="team">{t('Add Team')}</DropdownItem>
              <DropdownItem key="supervisor">{t('Add Supervisor')}</DropdownItem>
              <DropdownItem key="equipment">{t('Add Equipment')}</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </Tooltip>

      <Tooltip
        content={selectedTab === 'teams' ? 'Refresh all team posts from schedule' : 'Update all locations'}
        placement="top"
      >
        <div>
          <Button
            isIconOnly
            size="sm"
            variant="flat"
            className="rounded-full bg-transparent hover:bg-surface-liner"
            onPress={onRefreshPosts}
            aria-label="Update all posts"
            isDisabled={selectedTab !== 'teams' || !hasPostingTimes}
          >
            <RotateCw className="h-5 w-5" />
          </Button>
        </div>
      </Tooltip>

      <Tooltip content="Sort and view options" placement="top">
        <div>
          <Dropdown classNames={SORT_MENU_CLASSNAMES}>
            <DropdownTrigger>
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                className="rounded-full bg-transparent hover:bg-surface-liner"
                aria-label="Sort teams"
              >
                <ArrowDownWideNarrow className="h-5 w-5" />
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="Sort and view options">
              <DropdownItem
                key="view-toggle"
                isReadOnly
                className="cursor-default hover:bg-transparent px-0 py-0"
                textValue="View toggle"
              >
                <Tabs
                  selectedKey={cardViewMode}
                  onSelectionChange={(key) => onCardViewModeChange(key as CardViewMode)}
                  size="sm"
                  fullWidth
                  classNames={{
                    tabList: 'gap-0 w-full bg-surface-deep p-0.5 rounded-lg',
                    tab: 'h-7 data-[selected=true]:text-surface-light data-[hover=true]:opacity-100 transition-colors',
                    cursor: 'bg-surface-liner',
                  }}
                >
                  <Tab
                    key="normal"
                    title={
                      <Tooltip content="Standard card view with full details" placement="top">
                        <div className="flex items-center gap-1 pointer-events-none">
                          <Rows2 className="h-4 w-4" />
                        </div>
                      </Tooltip>
                    }
                  />
                  <Tab
                    key="condensed"
                    title={
                      <Tooltip content="Compact card view for more teams on screen" placement="top">
                        <div className="flex items-center gap-1 pointer-events-none">
                          <Rows4 className="h-4 w-4" />
                        </div>
                      </Tooltip>
                    }
                  />
                </Tabs>
              </DropdownItem>
              <DropdownItem
                key="divider"
                isReadOnly
                className="p-0 m-0 h-px bg-surface-liner cursor-default"
                textValue="divider"
              >
                <div className="h-px" />
              </DropdownItem>
              <>
                {sortOptions.map(({ key, label }) => (
                  <DropdownItem key={key} onClick={() => onTeamSortModeChange(key)} className={selectedItemClass(teamSortMode === key)}>
                    {label}
                  </DropdownItem>
                ))}
              </>
            </DropdownMenu>
          </Dropdown>
        </div>
      </Tooltip>
    </div>
  );
}
