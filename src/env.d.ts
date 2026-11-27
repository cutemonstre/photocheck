/// <reference types="vite/client" />
declare module "cloudflare:workers" {
  import type { GateEnv } from "./server/gate";
  export const env: GateEnv;
}
