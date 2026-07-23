import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/pages/stub";

export const Route = createFileRoute("/timesheets")({
  head: () => ({ meta: [{ title: "Timesheets — OmERP" }] }),
  component: () => <StubPage title="Timesheets" />,
});
