// Metro is pointed at the PARENT directory so the app imports ../core/*.js
// directly — the same files the web app runs. One engine, no copies to drift.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the repo root so edits to core/ hot-reload in the app.
config.watchFolders = [workspaceRoot];

// Resolve modules from the mobile app first, then the repo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// core/ ships as ESM with explicit .js extensions; Metro handles that natively.
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs'];

module.exports = config;
