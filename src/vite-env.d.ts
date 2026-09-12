/// <reference types="vite/client" />

interface Window {
  __DEVSLIDES_TEST_ENV__?: boolean;
}

/** Set by the test harness (tests/helpers/jsdom-env.mts). */
var __DEVSLIDES_TEST_ENV__: boolean | undefined;
