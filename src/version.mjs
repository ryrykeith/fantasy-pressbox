/**
 * The package's name and version, as code rather than read from package.json,
 * so the browser can name them too (a league file's `writtenBy`,
 * src/leagueFile.mjs). tests/league-file.test.mjs fails when either differs
 * from package.json, so a release that bumps the version must bump it here.
 */
export const PACKAGE_NAME = 'fantasy-pressbox';
export const PACKAGE_VERSION = '0.2.0';
