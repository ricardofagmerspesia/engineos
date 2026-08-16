import { HistoryPageClient } from "./history-page-client";

export default function HistoryPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">History</h1>
      <p className="mt-1 text-sm text-slate-600">Every publish, most recent first, with rollback via git revert.</p>
      <div className="mt-6">
        <HistoryPageClient />
      </div>
    </main>
  );
}
