"use client";
import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createDecision } from './api';
import { DecisionForm } from './decision-form';
export function CreateDecisionView() {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const mutation = useMutation({ mutationFn: createDecisionInput });
  async function createDecisionInput(input: Parameters<typeof createDecision>[0]) { key.current ??= crypto.randomUUID(); return createDecision(input, key.current); }
  return <DecisionForm pending={mutation.isPending} onSubmit={async (input) => { const decision = await mutation.mutateAsync(input); router.push(`/decisions/${encodeURIComponent(decision.id)}`); }} />;
}
