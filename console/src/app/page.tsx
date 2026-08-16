// Placeholder only: Unit D owns the real dashboard content (design §7, `/`).
// This exists so `next dev` / `next build` have a root route to boot against.
export default function HomePage(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <p className="text-sm text-neutral-500">EngineOS Admin Console — dashboard pending.</p>
    </main>
  );
}
