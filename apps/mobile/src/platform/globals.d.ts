// React Native implements High Resolution Time (performance.now), but its
// TypeScript types don't declare it, and this app has no DOM lib.
declare var performance: { now(): number };

// Expo installs structuredClone (expo/src/winter); the testing kit's fake API uses it.
declare function structuredClone<T>(value: T): T;
