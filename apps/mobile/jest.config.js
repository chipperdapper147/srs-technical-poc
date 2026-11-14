/**
 * View and screen tests with React Native Testing Library on the React Native
 * preset (jest-expo). Run with --experimental-vm-modules (package.json), so
 * Jest can require() ES-module-only packages such as msw.
 */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // The testing kit's fake API hooks into Vitest's lifecycle; give it Jest's.
    "^vitest$": "<rootDir>/src/test/vitest-hooks.js",
  },
  testEnvironment: "<rootDir>/jest.environment.js",
  setupFiles: ["<rootDir>/jest.setup.js"],
};
