/**
 * The API's one door to @app/shared, by relative path rather than package
 * name. Vercel compiles the API's .ts files to .js; through the package's
 * `exports` (./src/index.ts) the compiled API looked for a .ts file that
 * Vercel no longer ships. A relative import is compiled and rewritten like
 * the API's own files. The web app still imports `@app/shared`.
 */
export * from "../../../packages/shared/src/index.ts";
