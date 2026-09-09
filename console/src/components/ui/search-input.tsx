"use client";

import { useId } from "react";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
};

export function SearchInput({ value, onChange, label, placeholder }: SearchInputProps) {
  // Generated rather than a fixed "console-search" so two search boxes on one
  // screen cannot collide on the id the label points at.
  const inputId = useId();

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? label}
        className="focus-ring w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
    </div>
  );
}
