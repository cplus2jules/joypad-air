const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The browser and native app use the same dependency-free translation catalog.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../public/i18n')];
module.exports = config;
