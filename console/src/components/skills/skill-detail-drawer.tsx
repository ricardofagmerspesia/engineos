"use client";

import { useEffect, useState } from "react";
import type { SkillEntity, ValidationIssue } from "../types";
import { Drawer } from "../ui/drawer";
import { Tabs, TabPanel } from "../ui/tabs";
import { Toggle } from "../ui/toggle";
import { StatusBadge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { ValidationIssuesList } from "../publish/validation-issues-list";

type SkillDetailDrawerProps = {
  skill: SkillEntity | null;
  onClose: () => void;
  onSave: (patch: { description?: string; enabled?: boolean }) => void;
  pending: boolean;
  validationIssues: ValidationIssue[];
};

const TABS = [
  { id: "details", label: "Details" },
  { id: "relationships", label: "Relationships" },
  { id: "raw-source", label: "Raw source" },
];

export function SkillDetailDrawer({ skill, onClose, onSave, pending, validationIssues }: SkillDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState("details");
  const [description, setDescription] = useState(skill?.description ?? "");

  // Reset the draft textarea whenever a different skill (or a fresher copy
  // of the same one) is opened, so a prior edit never leaks into the next
  // row's drawer.
  useEffect(() => {
    setDescription(skill?.description ?? "");
    setActiveTab("details");
  }, [skill?.id, skill?.description]);

  if (!skill) return null;

  const isDirty = description !== skill.description;

  return (
    <Drawer open={skill !== null} onClose={onClose} title={skill.name}>
      <div className="mb-3 flex items-center gap-2">
        <StatusBadge status={skill.status} />
        {skill.parseError ? <span className="text-xs text-red-700">{skill.parseError}</span> : null}
      </div>

      <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />

      <TabPanel id="details" activeId={activeTab}>
        <ValidationIssuesList issues={validationIssues} />

        <div className="mt-3">
          <label htmlFor="skill-description" className="block text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            id="skill-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Enabled</span>
          <Toggle
            checked={skill.enabled}
            disabled={pending}
            label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`}
            onChange={(next) => onSave({ enabled: next })}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={!isDirty || pending}
            onClick={() => onSave({ description })}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save description"}
          </button>
          {isDirty ? <span className="text-xs text-slate-500">Unsaved changes</span> : null}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
          <div>
            <dt className="font-medium text-slate-600">Updated</dt>
            <dd>{new Date(skill.updatedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">ID</dt>
            <dd className="font-mono">{skill.id}</dd>
          </div>
        </dl>
      </TabPanel>

      <TabPanel id="relationships" activeId={activeTab}>
        <div className="space-y-4">
          <section>
            <h3 className="text-sm font-semibold text-slate-700">Used by agents</h3>
            {skill.usedByAgents.length === 0 ? (
              <EmptyState
                title="No agents reference this skill yet"
                description="This is expected until the Agents ticket lands — it isn't a bug."
              />
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {skill.usedByAgents.map((agentId) => (
                  <li key={agentId} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                    {agentId}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="text-sm font-semibold text-slate-700">Depends on rules</h3>
            {skill.dependsOnRules.length === 0 ? (
              <EmptyState
                title="No rule dependencies detected"
                description="Best-effort scan of the SKILL.md body found no rule references."
              />
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {skill.dependsOnRules.map((ruleId) => (
                  <li key={ruleId} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                    {ruleId}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </TabPanel>

      <TabPanel id="raw-source" activeId={activeTab}>
        <p className="text-sm text-slate-600">
          Raw content view lands with the Rules/Agents tickets — no endpoint exists yet to read full file content.
          Source paths as of the last publish:
        </p>
        <ul className="mt-2 space-y-1 font-mono text-xs text-slate-700">
          {skill.sourcePaths.map((path) => (
            <li key={path} className="rounded bg-slate-50 px-2 py-1">
              {path}
            </li>
          ))}
        </ul>
      </TabPanel>
    </Drawer>
  );
}
