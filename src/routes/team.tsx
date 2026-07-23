import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/pages/stub";

export const Route = createFileRoute("/team")({
  head: () => ({ meta: [{ title: "Team — OmERP" }] }),
  component: () => <StubPage title="Team" />,
});
