import { defineConfig } from "vitest/config";

// Tests are plain Node and offline. A separate config keeps the Cloudflare and TanStack Vite plugins out of them.
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
