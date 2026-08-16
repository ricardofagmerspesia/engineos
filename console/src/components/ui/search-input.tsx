"use client";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
};

export function SearchInput({ value, onChange, label, placeholder }: SearchInputProps) {
  return (
    <div>
      <label htmlFor="console-search" className="sr-only">
        {label}
      </label>
      <input
        id="console-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? label}
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
      />
    </div>
  );
}
