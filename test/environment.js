// The React Native environment, keeping Node's own fetch: jest-expo replaces fetch with
// expo/fetch, which has no native module under Jest, and app tests talk to local Supabase.
const ReactNativeEnvironment = require('@react-native/jest-preset/jest/react-native-env.js');

const NETWORK_GLOBALS = ['fetch', 'Headers', 'Request', 'Response'];

module.exports = class AppTestEnvironment extends ReactNativeEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const name of NETWORK_GLOBALS) {
      Object.defineProperty(this.global, `__node${name}`, { value: globalThis[name] });
    }
  }
};
