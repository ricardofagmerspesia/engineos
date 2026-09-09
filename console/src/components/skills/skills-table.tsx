import type { SkillEntity } from "../types";
import { StatusBadge } from "../ui/badge";
import { Toggle } from "../ui/toggle";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../ui/table";

type SkillsTableProps = {
  skills: SkillEntity[];
  onRowClick: (skill: SkillEntity) => void;
  onToggleEnabled: (skill: SkillEntity, next: boolean) => void;
  pendingToggleId: string | null;
};

export function SkillsTable({ skills, onRowClick, onToggleEnabled, pendingToggleId }: SkillsTableProps) {
  return (
    <Table>
      <TableHead>
        <tr>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Description</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Enabled</TableHeaderCell>
          <TableHeaderCell>Updated</TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        {skills.map((skill) => (
          <TableRow key={skill.id} onClick={() => onRowClick(skill)}>
            <TableCell>
              {/* The row's onClick is pointer-only; this button is what makes
                  the drawer reachable by keyboard without giving the <tr> a
                  role that would break the table's semantics. */}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRowClick(skill);
                }}
                className="focus-ring text-left font-medium text-slate-900"
              >
                {skill.name}
              </button>
            </TableCell>
            <TableCell className="max-w-xs truncate text-slate-600">{skill.description}</TableCell>
            <TableCell>
              <StatusBadge status={skill.status} />
            </TableCell>
            <TableCell>
              {/* Stop propagation so flipping the toggle doesn't also open
                  the row's detail drawer. */}
              <span onClick={(event) => event.stopPropagation()}>
                <Toggle
                  checked={skill.enabled}
                  disabled={pendingToggleId === skill.id}
                  label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`}
                  onChange={(next) => onToggleEnabled(skill, next)}
                />
              </span>
            </TableCell>
            <TableCell className="text-slate-500">{new Date(skill.updatedAt).toLocaleDateString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
