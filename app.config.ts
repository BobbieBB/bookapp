// app.json plus what can't be written in it. Android pushes go through Firebase Cloud Messaging, which needs the
// google-services.json of Livami's Firebase project (27 Nov 2026: without it Android testers couldn't turn pushes
// on). It isn't in the repo: EAS gives it to the build as the file variable GOOGLE_SERVICES_JSON (see README,
// "Android pushes"). Expo Go and local builds without it simply have no Android pushes.
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...(config as ExpoConfig),
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : null) },
  };
};
