import { PublishPageClient } from "./publish-page-client";

// Server Component shell: no data fetching here (the draft/publish state is
// user-driven and cached client-side via TanStack Query), just the page
// frame per rules/frontend.md's RSC-first default.
export default function PublishPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Publish</h1>
      <p className="mt-1 text-sm text-slate-600">
        Review every pending change before it writes to the real files and creates a commit.
      </p>
      <div className="mt-6">
        <PublishPageClient />
      </div>
    </main>
  );
}
