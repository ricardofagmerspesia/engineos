import { useId } from 'react';
const control = 'focus-ring w-full rounded border border-slate-300 px-3 py-2 text-sm';
export function TextField({ label, value, onChange, multiline = false, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: string; required?: boolean }) {
  const id = useId();
  return <div className="space-y-1"><label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>{multiline ? <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} className={control} required={required} rows={3} /> : <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} className={control} required={required} />}</div>;
}
export const buttonStyle = 'focus-ring rounded border border-slate-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60';
