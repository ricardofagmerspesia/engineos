import type { ReactNode } from "react";

// Thin semantic wrappers, not a data-grid abstraction — plain <table> covers
// every list screen this ticket needs (rules/base.md: no abstraction for one
// caller pattern repeated instead of generalized prematurely).

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-full divide-y divide-slate-200 text-left text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50">{children}</thead>;
}

export function TableHeaderCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-2 font-medium text-slate-600 ${className}`}>
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>;
}

type TableRowProps = {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
};

/** `onClick` is a pointer convenience only. The row deliberately carries no
 * `role="button"`/`tabIndex`: overriding a `<tr>`'s role strips the implicit
 * row/cell roles from its children, so the table stops being a table for
 * assistive tech. Keyboard access belongs to a real control inside a cell —
 * see the skill-name button in `skills-table.tsx`. */
export function TableRow({ children, onClick, className = "" }: TableRowProps) {
  if (!onClick) {
    return <tr className={className}>{children}</tr>;
  }
  return (
    <tr onClick={onClick} className={`cursor-pointer hover:bg-slate-50 ${className}`}>
      {children}
    </tr>
  );
}

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-2 align-middle ${className}`}>{children}</td>;
}
