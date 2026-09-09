import type { ReactElement } from 'react';

const SCREENS = [
  { href: '/skills', label: 'Skills', description: 'Browse skills, toggle them, and edit descriptions in the draft.' },
  { href: '/publish', label: 'Publish', description: 'Review the staged diff and write the draft back to the repo.' },
  { href: '/history', label: 'History', description: 'Inspect past publishes and roll back to an earlier commit.' },
] as const;

export default function HomePage(): ReactElement {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">EngineOS Admin Console</h1>
      <p className="mt-1 text-sm text-slate-600">
        Stage changes to the EngineOS capability graph locally, then publish them as a single commit.
      </p>
      <ul className="mt-6 space-y-3">
        {SCREENS.map((screen) => (
          <li key={screen.href} className="rounded-md border border-slate-200 p-4">
            <a href={screen.href} className="focus-ring text-sm font-medium text-slate-900 hover:underline">
              {screen.label}
            </a>
            <p className="mt-1 text-sm text-slate-600">{screen.description}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
