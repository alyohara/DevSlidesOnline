/**
 * Test-environment detection for the esbuild/jsdom test harness (tests set
 * __DEVSLIDES_TEST_ENV__ on window/globalThis before importing app code).
 */
export function isTestEnv(): boolean {
  return Boolean(
    (typeof window !== "undefined" && window.__DEVSLIDES_TEST_ENV__) ||
    (typeof globalThis !== "undefined" && globalThis.__DEVSLIDES_TEST_ENV__),
  );
}
