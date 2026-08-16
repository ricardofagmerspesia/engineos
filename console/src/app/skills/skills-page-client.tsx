"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSkills, updateSkill, type SkillPatch } from "../../components/api/skills";
import { ApiError } from "../../components/api/client";
import type { SkillEntity } from "../../components/types";
import { SkillsTable } from "../../components/skills/skills-table";
import { SkillDetailDrawer } from "../../components/skills/skill-detail-drawer";
import { SearchInput } from "../../components/ui/search-input";
import { Banner } from "../../components/ui/banner";
import { EmptyState } from "../../components/ui/empty-state";
import { SkeletonRows } from "../../components/ui/skeleton";

export function SkillsPageClient() {
  const queryClient = useQueryClient();
  const skillsQuery = useQuery({ queryKey: ["skills"], queryFn: fetchSkills });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<ApiError | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillPatch }) => updateSkill(id, patch),
    onMutate: async ({ id, patch }) => {
      setPendingId(id);
      setLastError(null);
      await queryClient.cancelQueries({ queryKey: ["skills"] });
      const previous = queryClient.getQueryData<SkillEntity[]>(["skills"]);
      queryClient.setQueryData<SkillEntity[]>(["skills"], (old) =>
        old?.map((skill) => (skill.id === id ? { ...skill, ...patch } : skill)),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["skills"], context.previous);
      }
      setLastError(error instanceof ApiError ? error : null);
    },
    onSettled: () => {
      setPendingId(null);
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });

  const skills = useMemo(() => skillsQuery.data ?? [], [skillsQuery.data]);
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return skills;
    return skills.filter(
      (skill) => skill.name.toLowerCase().includes(term) || skill.description.toLowerCase().includes(term),
    );
  }, [skills, searchTerm]);

  const selectedSkill = skills.find((skill) => skill.id === selectedId) ?? null;

  function handleToggleEnabled(skill: SkillEntity, next: boolean) {
    updateMutation.mutate({ id: skill.id, patch: { enabled: next } });
  }

  function handleSave(patch: SkillPatch) {
    if (!selectedSkill) return;
    updateMutation.mutate({ id: selectedSkill.id, patch });
  }

  return (
    <div className="space-y-4">
      <SearchInput value={searchTerm} onChange={setSearchTerm} label="Search skills by name or description" />

      {lastError ? (
        <Banner variant="error" title="Could not save that change">
          {lastError.message}
          {lastError.issues && lastError.issues.length > 0 ? (
            <ul className="mt-1 list-inside list-disc">
              {lastError.issues.map((issue, index) => (
                <li key={index}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </Banner>
      ) : null}

      {skillsQuery.isLoading ? <SkeletonRows rows={6} columns={5} /> : null}

      {skillsQuery.isError ? (
        <Banner variant="error" title="Could not load skills">
          {skillsQuery.error instanceof Error ? skillsQuery.error.message : "Unknown error."}
          <button
            type="button"
            onClick={() => skillsQuery.refetch()}
            className="ml-2 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Retry
          </button>
        </Banner>
      ) : null}

      {!skillsQuery.isLoading && !skillsQuery.isError && skills.length === 0 ? (
        <EmptyState
          title="No skills found"
          description="Nothing under skills/*/SKILL.md parsed into the draft store yet."
        />
      ) : null}

      {!skillsQuery.isLoading && !skillsQuery.isError && skills.length > 0 && filtered.length === 0 ? (
        <EmptyState title="No skills match your search" description={`Nothing matches "${searchTerm}".`} />
      ) : null}

      {!skillsQuery.isLoading && !skillsQuery.isError && filtered.length > 0 ? (
        <SkillsTable
          skills={filtered}
          onRowClick={(skill) => setSelectedId(skill.id)}
          onToggleEnabled={handleToggleEnabled}
          pendingToggleId={pendingId}
        />
      ) : null}

      <SkillDetailDrawer
        skill={selectedSkill}
        onClose={() => setSelectedId(null)}
        onSave={handleSave}
        pending={updateMutation.isPending}
        validationIssues={selectedSkill && lastError?.issues ? lastError.issues : []}
      />
    </div>
  );
}
