import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/pages/stub";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — OmERP" }] }),
  component: () => <StubPage title="Reports" />,
});
