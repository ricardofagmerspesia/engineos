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

/** When `onClick` is given the row is also keyboard-activatable (Enter/Space)
 * via a native button-role treatment, so "row click opens the drawer" works
 * without a mouse. */
export function TableRow({ children, onClick, className = "" }: TableRowProps) {
  if (!onClick) {
    return <tr className={className}>{children}</tr>;
  }
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`cursor-pointer hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-500 ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-2 align-middle ${className}`}>{children}</td>;
}
