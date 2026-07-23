import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/pages/stub";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "Projects — OmERP" }] }),
  component: () => <StubPage title="Projects" />,
});
