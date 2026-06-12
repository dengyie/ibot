# OpenPet Release Checklist

> Purpose: keep local test builds, signed releases, and public artifacts reproducible without exposing signing credentials.

## 1. Preflight

- Confirm `npm test` passes.
- Confirm `npm run check:syntax` passes.
- Confirm `npm run pack` creates an unsigned directory package.
- Confirm the About page shows the expected app version and packaged state.
- Confirm local HTTP remains disabled by default after a fresh install.

## 2. macOS Signing Inputs

Release signing and notarization must only read credentials from environment variables or the runner keychain:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK` or a locally installed Developer ID Application certificate
- `CSC_KEY_PASSWORD` when `CSC_LINK` is used

The app must continue to build unsigned local packages when these variables are absent.

## 3. Release Build

- Create a tag named `vX.Y.Z`.
- Let GitHub Actions run the release workflow from the tag.
- Download the generated DMG/ZIP artifacts.
- Verify the app launches and shows the pet window.
- Open Control Center and smoke test Pet, Actions, AI, Plugins, Service, and About.

## 4. macOS Verification

Run these checks on the signed app or mounted DMG output:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac/OpenPet.app"
spctl --assess --type execute --verbose=4 "release/mac/OpenPet.app"
```

## 5. Update Check

- Publish the GitHub Release for the tag.
- Open Control Center → About.
- Run Check Updates.
- Confirm the latest version, release URL, and DMG/ZIP asset names are displayed.

## 6. Rollback

- Unpublish or mark a bad release as draft if it should not be discovered by update checks.
- Keep the previous release artifact available.
- Rotate any exposed CI signing credentials immediately if a workflow log or artifact leaks them.
