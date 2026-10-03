# The native SQLite binary (better-sqlite3 in Electron)

## The problem

`better-sqlite3` is a native add-on: a compiled `better_sqlite3.node` file. A file built for Node cannot be loaded by Electron, because Electron has a different binary interface (its "ABI"). Our tests, scripts and `npm run dev:db` run on plain Node and need the Node build. The desktop app runs on Electron and needs the Electron build. Both cannot live at the same path in `node_modules`.

## What we do

The desktop app loads a **second, Electron-built copy** of the file, from `apps/desktop/native/`, and passes its path to `better-sqlite3` with the `nativeBinding` option (`openDatabase(path, { nativeBinding })`). `node_modules` is never touched, so `npm test` keeps working with the Node build.

```
apps/desktop/native-binaries.json     the pin: versions, download URL, SHA-256 of the archive and of the file
apps/desktop/scripts/fetch-native.mjs downloads, verifies, installs (idempotent; offline is fine once it is there)
apps/desktop/scripts/check-native.mjs runs before `npm run dev` and `npm run build`
apps/desktop/native/<platform>-<arch>-electron<abi>/better_sqlite3.node    (git-ignored)
apps/desktop/src/main/native.ts       finds the file at run time, with a clear error if it is missing
```

## Pinned and verified

- **Electron is pinned to an exact version** (42.11.10). The binary is built for that ABI, so a loose `^` range would break the app on the next install. The version is 42 and not 44 because `better-sqlite3` 12 publishes prebuilt Electron binaries for 40, 41 and 42 only. For 43 and above the file would have to be compiled from source, which needs Visual Studio Build Tools.
- `native-binaries.json` holds the exact download URL (a GitHub release of `better-sqlite3`) and **two SHA-256 hashes**: of the downloaded archive, and of the `.node` file inside it.
- `fetch-native.mjs` refuses to install anything unless both hashes match, and refuses to run if the installed `better-sqlite3`, `electron` or Electron ABI differ from the pin.
- `apps/desktop/tests/native-and-prefs.test.ts` fails if someone bumps Electron or `better-sqlite3` without updating the pin, and checks the installed file against its hash.
- GitHub does not publish checksums for these files, so the hashes were taken from the first download and are reviewed by whoever updates the pin ("trust on first use").

## Commands

```
npm run native                    # download if missing, verify (also runs automatically before npm run dev)
npm run native -w @pos/desktop -- --print-hashes   # download and print the hashes, when updating the pin
```

Needs internet only for the first download.

## Upgrading Electron or better-sqlite3

1. Check that a prebuilt binary exists for the new pair (open the `better-sqlite3` release and look for `electron-v<abi>-win32-x64`). If none exists, stay on the older Electron.
2. Change the versions in `apps/desktop/package.json` and `native-binaries.json` (`abi` is in `node_modules/electron/abi_version`).
3. Run `npm run native -w @pos/desktop -- --print-hashes`, review, paste the hashes into `native-binaries.json`.
4. `npm run native`, `npm test`, `npm run dev`.

## Packaging (Phase 9)

The installer **must ship `better_sqlite3.node`** (and the `@node-rs/argon2` binding) outside the asar archive: Electron cannot load native files from inside it. The app looks for the SQLite file at `<resources>/native/<platform>-<arch>-electron<abi>/better_sqlite3.node` when installed (`app.isPackaged`). Test an installed build, not only `npm run dev`. See Phase 9 in `docs/build-plan.md`.

## Would `electron-builder install-app-deps` or `@electron/rebuild` do this with less code?

They are the standard tools, and they would work, but they solve a slightly different problem:

- `@electron/rebuild` (which `electron-builder install-app-deps` calls) rebuilds native modules **in place** in `node_modules` for Electron. For `better-sqlite3` it tries the same prebuilt download first (it uses `prebuild-install`) and only compiles if there is none, so it would fetch the same file.
- The catch is "in place". After it runs, `node_modules` holds the Electron build and `npm test` fails until you rebuild for Node (and the other way round). Working around that means rebuilding on every switch between tests and the app.
- It also gives no pinning or hash check of its own.

So for development and tests the small script here is the simpler and safer choice (about 100 lines, no switching). For the **installer** in Phase 9 the picture changes: `electron-builder` rebuilds a copy of the dependencies during packaging anyway (`npmRebuild`), so it may be able to produce the packaged binary on its own. Decide then: either let electron-builder do it and keep the pin only for development, or copy the pinned, verified file into the installer. Copying the pinned file keeps one source of truth, which is why the plan above says the installer must ship it.
