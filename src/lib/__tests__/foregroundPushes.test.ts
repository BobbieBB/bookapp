import { showForegroundPushesQuietly } from '../pushDevice';

// app/_layout.tsx sets the foreground handler when it is imported, so every screen test that loads the
// layout runs this against jest-expo's stand-in for the native notifications module.
it('sets the foreground push handler, and can set it again', () => {
  expect(() => {
    showForegroundPushesQuietly();
    showForegroundPushesQuietly();
  }).not.toThrow();
});
