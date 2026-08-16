import { SkillsPageClient } from "./skills-page-client";

// TODO: nav link — layout.tsx (sibling shell unit) should add a nav entry
// pointing here once Providers wraps the tree.
export default function SkillsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Skills</h1>
      <p className="mt-1 text-sm text-slate-600">
        Search, toggle, and edit skill metadata in the draft — nothing here touches the real files until publish.
      </p>
      <div className="mt-6">
        <SkillsPageClient />
      </div>
    </main>
  );
}
