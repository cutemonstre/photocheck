import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { handle } from "../server/gate";

export const Route = createFileRoute("/photos/$key")({
  server: { handlers: { GET: ({ request }) => handle(request, env), POST: ({ request }) => handle(request, env) } },
});
