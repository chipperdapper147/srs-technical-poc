import type { NextConfig } from "next";

const config: NextConfig = {
  // @app/shared ships TypeScript source; let Next compile it.
  transpilePackages: ["@app/shared"],
  typedRoutes: true,
};

export default config;
