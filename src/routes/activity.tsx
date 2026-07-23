import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/pages/stub";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity — OmERP" }] }),
  component: () => <StubPage title="Activity" />,
});
