// /Users/gozyr/Development/ducksmart/DuckSmart/DuckSmart/app.config.js

const IS_DEV = process.env.APP_VARIANT === "development";

module.exports = {
  expo: {
    name: IS_DEV ? "DuckSmart (Dev)" : "DuckSmart",
    slug: "ducksmart",
    scheme: "ducksmart",
    version: "1.3.6",
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
      googleServicesFile:
        process.env.GOOGLE_SERVICES_PLIST || "./firebase/GoogleService-Info.plist",
      supportsTablet: false,
      bundleIdentifier: "com.ducksmart.app",
      buildNumber: "2",
      usesAppleSignIn: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "DuckSmart uses your location to provide accurate local weather forecasts and to mark your hunting spots on the map. For example, we'll show you wind speed and temperature at your current location to help plan your hunt.",
        NSPhotoLibraryUsageDescription:
          "DuckSmart uses your photo library to attach photos to your hunt logs, update your profile photo, and analyze duck species using AI identification. For example, you can add photos of your harvest to a log entry or choose a profile image for in-app sharing.",
        NSCameraUsageDescription:
          "DuckSmart uses your camera so you can take photos for hunt logs, license storage, duck identification, and your profile photo.",
      },
    },

    android: {
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON || "./firebase/google-services.json",
      supportsTablet: false,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#000000",
      },
      edgeToEdgeEnabled: false,
      package: "com.ducksmart.app",
      versionCode: 2,
      config: {
        googleMaps: {
          apiKey:
            process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
            "AIzaSyAwUD3DYSwQzceGAjQCuJDJ4gqOUIix0sg",
        },
      },
    },

    web: {
      favicon: "./assets/favicon.png",
    },

    extra: {
      functionsBaseUrl: "https://us-central1-ducksmart-9c80e.cloudfunctions.net",

      firebase: {
        androidApiKey:
          process.env.FIREBASE_ANDROID_API_KEY ||
          "AIzaSyBnwwwpGQv_-UfdxPmDWbQM1tR7Z6obH74",
        iosApiKey:
          process.env.FIREBASE_IOS_API_KEY ||
          "AIzaSyAYuVXKtrMbp1D8pAy0EAFArONDrp6W-iY",
        authDomain:
          process.env.FIREBASE_AUTH_DOMAIN || "ducksmart-9c80e.firebaseapp.com",
        projectId: process.env.FIREBASE_PROJECT_ID || "ducksmart-9c80e",
        storageBucket:
          process.env.FIREBASE_STORAGE_BUCKET ||
          "ducksmart-9c80e.firebasestorage.app",
        messagingSenderId:
          process.env.FIREBASE_MESSAGING_SENDER_ID || "747578003996",
        androidAppId:
          process.env.FIREBASE_ANDROID_APP_ID ||
          "1:747578003996:android:fa1b978454b9f99fca85d9",
        iosAppId:
          process.env.FIREBASE_IOS_APP_ID ||
          "1:747578003996:ios:7bef85dda10811b4ca85d9",
        googleWebClientId:
          process.env.FIREBASE_GOOGLE_WEB_CLIENT_ID ||
          "747578003996-1vuqq0capvfg22n607dj9l6icrpfor1f.apps.googleusercontent.com",
      },

      eas: {
        projectId: "1e281451-6f41-4ee8-a71e-363eff7ee6ee",
      },
    },

    plugins: [
      "expo-font",
      "@react-native-community/datetimepicker",
      "@react-native-firebase/app",
      [
        "expo-build-properties",
        {
          ios: {
            useFrameworks: "static",
            forceStaticLinking: ["RNFBApp", "RNFBAnalytics"],
          },
        },
      ],
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
          iosUrlScheme:
            process.env.GOOGLE_IOS_URL_SCHEME ||
            "com.googleusercontent.apps.747578003996-k5mnce6ejjg1vqgqq4bef8n85liu4eva",
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