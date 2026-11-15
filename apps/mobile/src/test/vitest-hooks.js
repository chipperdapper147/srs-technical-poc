// @app/client/testing registers the fake API with Vitest's lifecycle hooks;
// under Jest, `vitest` maps here (jest.config.js) and gets Jest's own.
const { afterAll, afterEach, beforeAll, beforeEach } = require("@jest/globals");

module.exports = { afterAll, afterEach, beforeAll, beforeEach };
