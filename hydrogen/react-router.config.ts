import type { Config } from "@react-router/dev/config";

export default {
  // Hydrogen/Oxygen packages the deployment from `dist/`, but React Router 7
  // defaults its build output to `build/`. Align them so `shopify hydrogen deploy`
  // can find the server worker (dist/server/index.js).
  buildDirectory: "dist",
  appDirectory: "app",
  ssr: true,
} satisfies Config;
