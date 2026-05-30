# Advisory rule-based translations

Each file is named `<language-code>.json` and must use the same keys as `en.json`.

## Supported codes (23)

`as`, `bn`, `brx`, `doi`, `en`, `gu`, `hi`, `kn`, `ks`, `kok`, `ml`, `mni`, `mr`, `mai`, `ne`, `or`, `pa`, `sa`, `sat`, `sd`, `ta`, `te`, `ur`

## Status

All 23 locale files should be present. After adding new keys to `en.json`, run:

```bash
node scripts/sync-advisory-locale-keys.mjs
```

Optional: `--dry-run` or `--lang=mr,te` to limit scope.

English-only copies of `en.json` are ignored at runtime until translated.

## Adding a language from app i18n

1. Copy `en.json` to `<code>.json`.
2. Map your app `translation` object keys to these advisory keys (or translate values manually).
3. Restart the server — files are loaded automatically from this folder.

LLM-generated advisory text uses the farmer language even when rule-based JSON is missing; rule-based hints and barren-land fallbacks use English until the JSON exists.
