import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { handle } from "../server/gate";

export const Route = createFileRoute("/upload")({
  server: { handlers: { POST: ({ request }) => handle(request, env), GET: ({ request }) => handle(request, env) } },
});
