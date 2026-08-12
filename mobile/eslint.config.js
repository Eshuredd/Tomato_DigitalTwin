const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  { ignores: ['dist/**', 'src/lib/api/schema.d.ts'] },
]);
