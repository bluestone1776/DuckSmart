// DuckSmart — Dynamic Expo Config
//
// Loads API keys from .env so secrets stay out of version control.
// Falls back to empty strings if .env is missing (e.g. fresh clone).

require("dotenv").config();

const IS_DEV = process.env.APP_VARIANT === "development";

module.exports = {
  expo: {
    name: IS_DEV ? "DuckSmart (Dev)" : "DuckSmart",
    slug: "ducksmart",
    version: "1.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.ducksmart.app",
      buildNumber: "1",
      usesAppleSignIn: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "DuckSmart uses your location to provide accurate local weather forecasts and to mark your hunting spots on the map. For example, we'll show you wind speed and temperature at your current location to help plan your hunt.",
        NSPhotoLibraryUsageDescription:
          "DuckSmart uses your photo library to attach photos to your hunt logs and to analyze duck species using AI identification. For example, you can add photos of your harvest to a log entry or upload a photo for AI duck identification.",
      },
    },
    android: {
      supportsTablet: false,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#000000",
      },
      edgeToEdgeEnabled: false,
      package: "com.ducksmart.app",
      versionCode: 1,
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || "",
        },
      },
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    extra: {
      // Secrets — loaded from .env (gitignored)
      openWeatherMapApiKey: process.env.OWM_API_KEY || "",
      regridToken: process.env.REGRID_TOKEN || "",
      openaiApiKey: process.env.OPENAI_API_KEY || "",
      ebirdApiKey: process.env.EBIRD_API_KEY || "",

      // Firebase — client-side keys loaded from .env
      // These are safe to ship in client bundles but should still
      // live in .env so they aren't committed to public repos.
      firebase: {
        androidApiKey: process.env.FIREBASE_ANDROID_API_KEY || "",
        iosApiKey: process.env.FIREBASE_IOS_API_KEY || "",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
        projectId: process.env.FIREBASE_PROJECT_ID || "",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
        androidAppId: process.env.FIREBASE_ANDROID_APP_ID || "",
        iosAppId: process.env.FIREBASE_IOS_APP_ID || "",
        googleWebClientId: process.env.FIREBASE_GOOGLE_WEB_CLIENT_ID || "",
      },
      eas: {
        projectId: "1e281451-6f41-4ee8-a71e-363eff7ee6ee",
      },
    },
    plugins: [
      "expo-font",
      [
        "expo-notifications",
        {
          sounds: [],
        },
      ],
      "expo-apple-authentication",
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME || "",
        },
      ],
      [
        "react-native-google-mobile-ads",
        {
          androidAppId: "ca-app-pub-1495369158025732~8701499241",
          iosAppId: "ca-app-pub-1495369158025732~9981452594",
        },
      ],
    ],
  },
};
