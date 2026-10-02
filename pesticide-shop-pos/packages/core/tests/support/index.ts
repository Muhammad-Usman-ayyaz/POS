// Test support shared by packages/core and packages/db-sqlite. Import it as '@pos/core/testing'.
// It imports vitest, so it is for tests only and is not part of the package's normal entry point.
export * from './world.js';
export { createFakeWorld } from './fake-world.js';
export { Instrument, instrument } from './instrument.js';
export { defineServiceSuites, runPurchaseSaleReturnScenario, type ScenarioResult } from './suites/index.js';
