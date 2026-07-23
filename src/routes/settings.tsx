import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/pages/stub";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — OmERP" }] }),
  component: () => <StubPage title="Settings" />,
});
