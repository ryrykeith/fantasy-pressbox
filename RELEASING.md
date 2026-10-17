# Releasing

How a version of `fantasy-pressbox` gets onto npm. This file is for
maintainers and does not ship in the package.

Two guards run however a version is published:

- **`prepublishOnly`** runs `npm test` and `scripts/check-pack.mjs` before every
  `npm publish`, by hand or from CI. A failing test, or a tarball that would
  contain `.env`, league data, a real prospect board, n-dx or assistant state,
  `tests/` or `scripts/`, stops the publish before anything is uploaded.
- **A version number can be published once.** npm refuses to reuse it, even
  after an unpublish (which npm mostly limits to the first 72 hours). A mistake in a published
  version is fixed by publishing the next one.

## The first release (0.1.0, by hand — done 2026-10-11)

npm trusted publishing can only be configured for a package that already
exists, so the first version is published from a maintainer's machine.

1. Start from an up-to-date `main` with a clean working tree:

   ```bash
   git switch main && git pull && git status
   ```

2. Check `package.json`'s `version` is `0.1.0` and `CHANGELOG.md` has a
   `## 0.1.0` section.
3. Log in to npm. With two-factor authentication on, the publish asks for a
   one-time code.

   ```bash
   npm login
   ```

4. Rehearse. This runs the tests and the pack check and prints the tarball's
   file list without uploading anything. Read the list.

   ```bash
   npm publish --dry-run
   ```

5. Publish. An unscoped package is public by default.

   ```bash
   npm publish
   ```

6. Tag the commit and create its GitHub release:

   ```bash
   gh release create v0.1.0 --target main --title v0.1.0 --notes "First public release. See CHANGELOG.md."
   ```

   This runs the Publish workflow. If 0.1.0 is already on npm it stops with a
   notice. If the release is created before the hand publish has finished, or
   before the trusted publisher exists, its `npm publish` fails with `E404`
   and nothing is published. That is what happened for v0.1.0, and it is
   harmless.

## Set up trusted publishing (once, after 0.1.0 exists)

From then on GitHub Actions publishes, with no npm token stored anywhere and
provenance attached to every version.

1. On npmjs.com open the package, then **Settings → Trusted Publisher**, and
   choose **GitHub Actions**.
2. Enter organization or user `ryrykeith`, repository `fantasy-pressbox`,
   workflow filename `publish.yml`. Leave the environment blank.
3. Once a release has gone out through the workflow, tighten
   **Settings → Publishing access** to require two-factor authentication and
   disallow tokens, so the workflow is the only way to publish.

Optional: to require an approval click before each publish, create a GitHub
environment (for example `npm`) with required reviewers, add
`environment: npm` to the job in `.github/workflows/publish.yml`, and enter the
same environment name in the npm trusted-publisher form.

## Every release after that

1. On a branch from `main`, bump the version without tagging:

   ```bash
   npm version patch --no-git-tag-version
   ```

   Use `minor` or `major` instead when the change calls for it. Set the same
   version in `src/version.mjs`, which names it to the browser (a league
   file's `writtenBy`); `npm test` fails until the two agree.

2. Add a `## <version>` section at the top of `CHANGELOG.md` describing what
   changed for someone running the tool. The heading must be exactly
   `## 0.2.0` (say): the workflow looks for `^## <version>$`, so no date or
   suffix.
3. Open a PR, let CI pass, and merge it.
4. Create the release from `main`, with the tag `v` plus the version:

   ```bash
   gh release create v0.1.1 --target main --title v0.1.1 --notes "See CHANGELOG.md."
   ```

5. The Publish workflow checks the tag matches `package.json`, checks
   `CHANGELOG.md` has the section, runs the tests and the pack check, and
   publishes. Watch it under the repository's **Actions** tab.

6. Check the release landed: `npm view fantasy-pressbox version` shows it,
   and jsDelivr serves the browser entry as JavaScript:

   ```bash
   curl -sI https://cdn.jsdelivr.net/npm/fantasy-pressbox@0.2.0/src/core/index.mjs | grep -i content-type
   ```

A release marked as a pre-release (for example `v0.2.0-beta.1`, with a
matching version in `package.json`) is published under the `next` dist-tag,
so `npm install fantasy-pressbox` keeps installing the latest stable version.

## If the Publish workflow fails

To delete a release together with its tag:

```bash
gh release delete v0.1.1 --cleanup-tag
```


- **Tag does not match `package.json`**: delete the release and its tag, then
  create it again with the right tag. Nothing was published.
- **No `CHANGELOG.md` section**: add it in a PR, merge, then delete and
  recreate the release.
- **`E404` or an auth error at `npm publish`**: the trusted publisher is
  missing or does not match (npm answers a missing one with `E404 Not Found`). Check the user, repository and workflow filename on npmjs.com.
- **Tests or the pack check fail**: fix on `main`, then delete and recreate
  the release so it points at the fixed commit.
