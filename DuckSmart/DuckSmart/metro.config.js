// DuckSmart Metro configuration
// Enables package exports resolution required by Firebase JS SDK v12+

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Firebase JS SDK v12 uses package.json "exports" field for subpath imports.
// Metro needs this flag to resolve firebase/app, firebase/auth, etc.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
