/**
 * jest-expo's React Native environment, keeping Node's fetch for the tests.
 * Expo replaces the global fetch with expo/fetch, whose native module never
 * answers under Jest; jest.setup.js puts Node's back, so the MSW fake API in
 * @app/client/testing serves the screens' requests.
 */
const { TestEnvironment } = require("jest-expo/src/preset/nativeEnvironment");

class Environment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.global.__nodeFetch = { fetch, Headers, Request, Response };
  }
}

module.exports = Environment;
