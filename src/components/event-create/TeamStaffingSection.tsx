import React from 'react';
import { Button, ButtonGroup, Card, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, ScrollShadow } from '@heroui/react';
import { Trash2, ChevronDown, Pencil } from 'lucide-react';
import type { Staff } from '@/app/types';

type Props = {
  staff: Staff[];
  openTeams: Record<number, boolean>;
  setOpenTeams: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onDeleteTeam: (idx: number) => void;
  onEditTeam: (idx: number) => void;
  onAddTeam: () => void;
  onUploadCSV: () => void;
  /** A tutorial callout pointing at Add Team (Lite mode), shown until the first team exists. */
  addTeamHint?: string;
};

export default function TeamStaffingSection({
  staff,
  openTeams,
  setOpenTeams,
  onDeleteTeam,
  onEditTeam,
  onAddTeam,
  onUploadCSV,
  addTeamHint,
}: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="relative flex-shrink-0 px-4 py-3 flex items-center justify-between">
        <h3 className="text-surface-light font-semibold text-lg">Teams</h3>
        <ButtonGroup radius="full">
          <Button
            size="sm"
            onPress={onAddTeam}
            className="h-8 px-3 text-sm text-surface-light bg-default/40 hover:bg-default/60"
            data-testid="add-team-button"
          >
            Add Team
          </Button>
          <Dropdown>
            <DropdownTrigger>
              <Button
                isIconOnly
                size="sm"
                className="h-8 min-w-8 w-8 text-surface-light bg-default/40 hover:bg-default/60"
                aria-label="More add-team options"
              >
                <ChevronDown className="h-4 w-4 text-surface-light" />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Team add options"
              onAction={(key) => {
                if (key === 'upload-csv') onUploadCSV();
              }}
            >
              <DropdownItem key="upload-csv">Upload CSV</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </ButtonGroup>
        {addTeamHint && staff.length === 0 && (
          <div role="note" className="absolute right-4 top-full z-10 mt-1 max-w-[240px] rounded-lg bg-neutral-200 px-3 py-2 text-xs leading-snug text-neutral-800 shadow-md">
            {/* The corner pointer, under the Add Team half of the button group. */}
            <span aria-hidden className="absolute -top-1.5 right-[72px] h-3 w-3 rotate-45 bg-neutral-200" />
            {addTeamHint}
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex-1 min-h-0 flex flex-col">
        <ScrollShadow className="space-y-2 pr-2 scrollbar-hide flex-1 min-h-0" hideScrollBar style={{ overflow: 'auto' }}>
          {staff.map((team, idx) => (
            <Card key={idx} radius="sm" className="bg-default/40">
              <div
                className="flex items-center justify-between px-3 py-2 gap-2 cursor-pointer"
                onClick={() => setOpenTeams((prev) => ({ ...prev, [idx]: !prev[idx] }))}
              >
                <span className="text-surface-light font-medium truncate leading-normal">{team.team}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTeam(idx);
                    }}
                    className="p-1 rounded bg-transparent"
                    aria-label="Edit team"
                  >
                    <Pencil className="h-4 w-4 text-surface-light" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTeam(idx);
                    }}
                    className="p-1 rounded bg-transparent"
                    aria-label="Delete team"
                  >
                    <Trash2 className="h-4 w-4 text-status-red" />
                  </button>
                </div>
              </div>
              {openTeams[idx] && (
                <ul className="px-3 pb-2 list-disc list-inside text-sm text-surface-faint">
                  {team.members.map((member, mIdx) => (
                    <li key={mIdx}>{member}</li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </ScrollShadow>
      </div>
    </div>
  );
}
