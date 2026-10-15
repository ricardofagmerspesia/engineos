import { DecisionDetailView } from '../../../features/decisions/decision-detail';
export default async function DecisionPage({ params }: { params: Promise<{ decisionId: string }> }) { const { decisionId } = await params; return <main className="mx-auto max-w-6xl px-4 py-8"><DecisionDetailView decisionId={decisionId} /></main>; }
