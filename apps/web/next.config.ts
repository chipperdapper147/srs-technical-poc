import type { NextConfig } from "next";

const config: NextConfig = {
  // The workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ["@app/shared", "@app/client"],
  typedRoutes: true,
};

export default config;
