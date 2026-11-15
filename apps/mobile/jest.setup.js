// Node's fetch instead of expo/fetch (see jest.environment.js), so the MSW
// fake API answers. Runs after jest-expo's setup, which installs expo/fetch.
for (const [name, value] of Object.entries(globalThis.__nodeFetch)) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

// Native modules have no implementation under Jest: use their published mocks.
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
