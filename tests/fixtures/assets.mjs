// The shipped assets as the CLI loads them with no workspace: prompts, default
// config and bye-week tables from the package folder. For tests that call a
// pipeline step or build a prompt and have no workspace prompts of their own.
import { loadDiskAssets } from '../../src/config.mjs';

export const assets = loadDiskAssets();
