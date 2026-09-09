"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

type Tab = {
  id: string;
  label: string;
};

type TabsProps = {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  label: string;
  /** Shared with the matching `TabPanel`s so `aria-controls` /
   * `aria-labelledby` still resolve, and so two tablists on one page cannot
   * mint the same DOM ids. The caller owns it because the panels are rendered
   * as siblings of the tablist, not as its children. */
  idPrefix: string;
};

function tabIdFor(idPrefix: string, tabId: string): string {
  return `${idPrefix}-tab-${tabId}`;
}

function tabPanelIdFor(idPrefix: string, tabId: string): string {
  return `${idPrefix}-tabpanel-${tabId}`;
}

function nextTabIndex(key: string, index: number, count: number): number | null {
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Minimal tablist: click or Left/Right/Home/End to move focus+selection
 * between tabs, matching the native tab-widget keyboard pattern instead of
 * relying on plain Tab-key traversal through every tab on every visit. */
export function Tabs({ tabs, activeId, onChange, label, idPrefix }: TabsProps) {
  const tabNodes = useRef(new Map<string, HTMLButtonElement>());

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = nextTabIndex(event.key, index, tabs.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    onChange(nextTab.id);
    // The roving tabindex means only the selected tab is tabbable, so focus
    // has to follow selection — otherwise the next arrow press would be
    // measured from the tab the user visually left behind.
    tabNodes.current.get(nextTab.id)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-slate-200">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) {
                tabNodes.current.set(tab.id, node);
              } else {
                tabNodes.current.delete(tab.id);
              }
            }}
            role="tab"
            id={tabIdFor(idPrefix, tab.id)}
            aria-selected={isActive}
            aria-controls={tabPanelIdFor(idPrefix, tab.id)}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`focus-ring -mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              isActive
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

type TabPanelProps = {
  id: string;
  activeId: string;
  idPrefix: string;
  children: ReactNode;
};

export function TabPanel({ id, activeId, idPrefix, children }: TabPanelProps) {
  if (id !== activeId) return null;
  return (
    <div
      role="tabpanel"
      id={tabPanelIdFor(idPrefix, id)}
      aria-labelledby={tabIdFor(idPrefix, id)}
      className="pt-4"
    >
      {children}
    </div>
  );
}
