import { createFileRoute } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Overview } from "@/components/pages/overview";
import { getOverview } from "@/lib/overview.functions";

const searchSchema = z.object({
  range: fallback(z.string(), "day").default("day"),
  team: fallback(z.string(), "all").default("all"),
});

const RANGES = ["day", "week", "month"] as const;
const TEAMS = ["all", "engineering", "design", "product", "data", "qa"] as const;
type Range = (typeof RANGES)[number];
type Team = (typeof TEAMS)[number];

const clamp = (s: string, allowed: readonly string[], fallbackVal: string) =>
  allowed.includes(s) ? s : fallbackVal;

export const overviewQueryOptions = (range: Range, team: Team) =>
  queryOptions({
    queryKey: ["overview", range, team],
    queryFn: () => getOverview({ data: { range, team } }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

export const Route = createFileRoute("/")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => ({
    range: clamp(search.range, RANGES, "day") as Range,
    team: clamp(search.team, TEAMS, "all") as Team,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(overviewQueryOptions(deps.range, deps.team)),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Failed to load overview: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Not found.</div>,
  component: Overview,
});
