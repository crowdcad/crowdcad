// components/modals/BulkImportModal.tsx
"use client";

import * as React from "react";
import Papa from "papaparse";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@heroui/react";
import { Download, Upload } from "lucide-react";
import type { Role, Staff, Supervisor } from "@/app/types";
import { newTeamId } from '@/lib/teamId';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  mode: "team" | "supervisor";
  roles: Role[];
  existingTeamNames: string[];
  onImport: (staff: Staff[], supervisors: Supervisor[]) => void;
};

type ParsedRow = {
  rowNumber: number;
  team: string;
  memberName: string;
  cert: string;
  lead: boolean;
  error?: string;
};

const TEAM_TEMPLATE_HEADERS = ["team", "memberName", "cert", "lead"];
const SUPERVISOR_TEMPLATE_HEADERS = ["callsign", "memberName", "cert"];

export default function BulkImportModal({
  isOpen,
  onClose,
  mode,
  roles,
  existingTeamNames,
  onImport,
}: Props) {
  const [rows, setRows] = React.useState<ParsedRow[]>([]);
  const [fileName, setFileName] = React.useState<string>("");
  const [parseError, setParseError] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const validCerts = React.useMemo(
    () => new Set(roles.map((r) => r.name.toUpperCase())),
    [roles]
  );

  const reset = () => {
    setRows([]);
    setFileName("");
    setParseError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDownloadTemplate = () => {
    const headers = mode === "team" ? TEAM_TEMPLATE_HEADERS : SUPERVISOR_TEMPLATE_HEADERS;
    const sample: Record<string, string>[] =
      mode === "team"
        ? [
            { team: "Team 1", memberName: "Jane Doe", cert: "EMT-B", lead: "true" },
            { team: "Team 1", memberName: "John Smith", cert: "FA", lead: "false" },
          ]
        : [{ callsign: "SAM 1", memberName: "Jane Doe", cert: "EMT-P" }];

    const csv = Papa.unparse({ fields: headers, data: sample });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.setAttribute(
      "download",
      mode === "team" ? "team_upload_template.csv" : "supervisor_upload_template.csv"
    );
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });

      if (result.errors.length > 0) {
        setParseError(result.errors[0].message);
        setRows([]);
        return;
      }

      const teamKey = mode === "team" ? "team" : "callsign";
      const parsed: ParsedRow[] = result.data.map((raw, idx) => {
        const team = (raw[teamKey] || "").trim();
        const memberName = (raw.memberName || "").trim();
        const certRaw = (raw.cert || "").trim();
        const cert = roles.find((r) => r.name.toUpperCase() === certRaw.toUpperCase())?.name || certRaw;
        const lead = mode === "team" && /^(true|yes|1|x)$/i.test((raw.lead || "").trim());

        let error: string | undefined;
        if (!team) error = mode === "team" ? "Missing team name" : "Missing call sign";
        else if (!memberName) error = "Missing member name";
        else if (!certRaw) error = "Missing certification";
        else if (!validCerts.has(certRaw.toUpperCase())) error = `Unknown certification "${certRaw}"`;
        else if (existingTeamNames.some((n) => n.toLowerCase() === team.toLowerCase()))
          error = mode === "team" ? "Team name already exists" : "Call sign already exists";

        return { rowNumber: idx + 2, team, memberName, cert, lead, error };
      });

      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => r.error);

  const handleConfirm = () => {
    if (submitting || validRows.length === 0) return;
    setSubmitting(true);
    try {
      if (mode === "team") {
        const grouped = new Map<string, ParsedRow[]>();
        for (const row of validRows) {
          if (!grouped.has(row.team)) grouped.set(row.team, []);
          grouped.get(row.team)!.push(row);
        }
        const staff: Staff[] = Array.from(grouped.entries()).map(([team, members]) => ({
          id: newTeamId(),
          team,
          location: "No Post",
          status: "On Break",
          members: members.map((m) => `${m.memberName} [${m.cert}]${m.lead ? " (Lead)" : ""}`),
        }));
        onImport(staff, []);
      } else {
        const supervisors: Supervisor[] = validRows.map((row) => ({
          id: newTeamId(),
          team: row.team,
          location: "Roaming",
          status: "On Break",
          member: `${row.memberName} [${row.cert}]`,
        }));
        onImport([], supervisors);
      }
      handleClose();
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "team" ? "Upload Teams from CSV" : "Upload Supervisors from CSV";
  const teamColumnLabel = mode === "team" ? "Team" : "Call Sign";

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      size="2xl"
      classNames={{
        base: "rounded-lg bg-surface-deepest text-surface-light mt-20",
        header: "pb-0",
        body: "py-4",
        footer: "pt-0",
      }}
    >
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader className="text-2xl font-bold text-surface">{title}</ModalHeader>

            <ModalBody className="space-y-3">
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-surface-liner p-3">
                <div className="text-sm text-surface-light/80">
                  Download a template CSV, fill it out, then upload it below.
                </div>
                <Button
                  size="sm"
                  radius="full"
                  variant="flat"
                  startContent={<Download className="h-4 w-4" />}
                  onPress={handleDownloadTemplate}
                >
                  Download template
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  radius="full"
                  variant="flat"
                  startContent={<Upload className="h-4 w-4" />}
                  onPress={() => fileInputRef.current?.click()}
                >
                  Choose CSV file
                </Button>
                <span className="text-sm text-surface-light/70 truncate">
                  {fileName || "No file selected"}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {parseError && <div className="text-sm text-status-red">{parseError}</div>}

              {rows.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm text-surface-light/80">
                    {validRows.length} row{validRows.length === 1 ? "" : "s"} ready to import
                    {errorRows.length > 0 && `, ${errorRows.length} with errors`}
                  </div>
                  <div className="max-h-64 overflow-auto rounded-2xl border border-surface-liner">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-surface-deep">
                        <tr className="text-left text-surface-light/70">
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">{teamColumnLabel}</th>
                          <th className="px-3 py-2">Member</th>
                          <th className="px-3 py-2">Cert</th>
                          {mode === "team" && <th className="px-3 py-2">Lead</th>}
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={row.error ? "text-status-red" : "text-surface-light"}
                          >
                            <td className="px-3 py-1.5">{row.rowNumber}</td>
                            <td className="px-3 py-1.5">{row.team}</td>
                            <td className="px-3 py-1.5">{row.memberName}</td>
                            <td className="px-3 py-1.5">{row.cert}</td>
                            {mode === "team" && <td className="px-3 py-1.5">{row.lead ? "Yes" : ""}</td>}
                            <td className="px-3 py-1.5">{row.error || "OK"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </ModalBody>

            <ModalFooter className="flex justify-end gap-2">
              <Button
                onPress={() => {
                  close();
                  handleClose();
                }}
                className="px-4 py-2 hover:bg-status-red/10 border border-status-red text-status-red"
                variant="bordered"
                radius="lg"
              >
                Cancel
              </Button>
              <Button
                onPress={handleConfirm}
                radius="lg"
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light"
                isDisabled={submitting || validRows.length === 0}
              >
                {`Import${validRows.length > 0 ? ` (${validRows.length})` : ""}`}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
