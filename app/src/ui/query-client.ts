import { QueryClient } from "@tanstack/react-query";

// Defaults for every query in the app. Venue clients own their own backoff, Retry-After handling and the
// "three 429s or any 403 pauses that venue for ten minutes" rule (dapp-design 4.8 R9), so the query layer
// must not retry behind their back, and must not refetch just because a window gained focus: a hidden or
// idle tab makes no requests. A feature that wants polling sets refetchInterval on its own query.
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchIntervalInBackground: false,
      },
    },
  });
}
