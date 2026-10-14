// The browser-safe entry: `import ... from 'fantasy-pressbox/core'`.
//
// Re-exports only. Everything reachable from this file must stay free of
// `node:` imports, `process` and `import.meta.url`, and must never reach
// generate.mjs (the AI call). tests/core-purity.test.mjs walks the static
// import graph and fails when that stops being true.
//
// ESPN is supported on the import route only: saved pages are parsed here,
// the cookie fetch (src/espn/client.mjs) stays CLI-only and is not exported.

// League file
export {
  LEAGUE_FILE_SCHEMA_VERSION,
  newLeagueFile,
  parseLeagueFile,
  serializeLeagueFile,
  leagueFileFromWorkspace,
} from '../leagueFile.mjs';
export { createMemoryStore } from '../storeCore.mjs';

// Settings
export { OPTIONS, EDITIONS } from '../options.mjs';
export { resolveSettings, rankEmoji } from '../settings.mjs';

// Editions
export { openLeague, resolveWeek } from '../pipeline.mjs';
export { prepareEdition, recordEdition } from '../edition.mjs';
export { buildPrompt } from '../promptContext.mjs';

// Replies
export {
  splitPosts,
  checkPosts,
  extractJsonBlock,
  stripJsonBlock,
  formatPost,
  looksCollapsed,
} from '../validate.mjs';
export { gradePredictions } from '../rankingGrades.mjs';

// Status
export { inspectLeague } from '../inspect.mjs';

// Assets
export { loadAssets } from '../assets.mjs';

// ESPN import route (saved pages only; nothing here fetches from ESPN)
export {
  readSavedFiles,
  classifySaved,
  parseSavedFile,
  importedWeekBundle,
  leaguePageFreshness,
  staleLeagueNotice,
  EspnImportError,
  EspnStaleLeagueError,
  EspnShapeError,
  espnImportLinks,
} from '../providers.mjs';
