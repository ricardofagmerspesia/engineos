"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// One QueryClient per mount (not per render) so navigating between /skills,
// /publish, /history shares a cache instead of every screen refetching cold.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
          },
        },
      }),
  );

  // TODO: nav link — layout.tsx (sibling shell unit's scope) needs to wrap
  // {children} with <Providers> for TanStack Query to work on any screen,
  // and should add nav links to /skills, /publish, /history once this
  // provider is wired in.
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
