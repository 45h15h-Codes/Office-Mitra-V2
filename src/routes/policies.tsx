import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/pages/stub";

export const Route = createFileRoute("/policies")({
  head: () => ({ meta: [{ title: "Policies — OmERP" }] }),
  component: () => <StubPage title="Policies" />,
});
