# LifeWiki v2.1.4 Release Notes

LifeWiki v2.1.4 improves entity detection accuracy and search performance by introducing Aho-Corasick multi-pattern matching into the entity index, and unifying entity lookup across all analysis paths.

## Highlights

- **Aho-Corasick entity scanning**: `EntityIndex` now uses Aho-Corasick failure links to scan diary content against all entity names and aliases in a single O(M) pass, replacing the previous O(N×M) substring iteration.
- **Unified entity matching**: `CaptureAnalyzer` and `search_entity` tool now use `EntityIndex.findBestMatch()` with layered matching (exact → alias → prefix → edit distance), replacing naive exact-match lookups.
- **Enriched entity context**: AI prompts now include matched entity metadata (company, position, relationship), helping the AI recognize existing entities during analysis.
- **Chat mode entity lookup improved**: `search_entity` executor returns `matchType` and `confidence` alongside entity data, making fuzzy matches transparent to the AI.
- **No external dependencies**: Aho-Corasick is implemented in pure TypeScript (~150 lines), compatible with Obsidian's browser/Electron environment.
- **On-demand index rebuild**: Entity index is rebuilt from the entity cache on each analysis, ensuring stale data is never served after entity updates or plugin restart.

## Changes

### Added
- `EntityIndex.buildFailureLinks()`: BFS-based Aho-Corasick failure link construction.
- `EntityIndex.scanContent()`: Single-pass multi-pattern content scanning with position tracking.
- `EntityIndex.longestOnly` deduplication for overlapping pattern matches.
- Minimum pattern length filter (≥ 2 characters) to prevent false positives from short patterns.
- Performance logging for index build time, scan time, and match counts.

### Changed
- `CaptureAnalyzer.selectPromptEntities()` now uses AC scanning instead of substring iteration.
- `CaptureAnalyzer.formatEntityContext()` now includes company, position, and relationship metadata.
- `search_entity` executor now uses `EntityIndex.findBestMatch()` instead of `EntityManager.findEntity()`.
- `CaptureAnalyzer.resolveEntityIds()` now uses `EntityIndex.findBestMatch()` with layered matching.
- `CaptureAnalyzer.buildEntityLookup()` removed — `EntityIndex` replaces it.
- Trie now stores both original-case and lowercase paths for case-insensitive AC scanning.

### Fixed
- Archived entities being mistakenly identified as new entities during diary analysis.
- Chat mode returning "entity not found" when user queries entities by alias or partial name.

## Install

```bash
curl -fsSL https://github.com/d19310/lifewiki/releases/download/v2.1.4/install.sh | bash
```

Upgrade an existing vault:

```bash
curl -fsSL https://github.com/d19310/lifewiki/releases/download/v2.1.4/install.sh | bash -s -- --update -v "$HOME/Documents/LifeWiki"
```

## Release Assets

- `main.js`
- `manifest.json`
- `styles.css`
- `install.sh`
- `lifewiki-v2.1.4.zip`
- `SHA256SUMS`
- `RELEASE-2.1.4.md`

## Notes

- Official plugin ID remains `lifewiki`.
- Plugin version is `2.1.4`.
- No vault migration required — fully backwards compatible with v2.1.x vaults.
- Existing `detect_entities` executor continues to work unchanged; AC scanning adds capability without modifying existing matching methods.
