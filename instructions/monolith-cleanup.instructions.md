---
applyTo: "**/*"
---

# Monolith Cleanup Steps

- Archive the original monolithic file before deleting it: copy or move it to src/_archive/ and add .bak (example: src/_archive/foo.rs.bak).
- Delete (cull) the original monolithic file from src so only the refactored module directory remains.
- Avoid duplicate module paths: do not keep both foo.rs and foo/mod.rs; keep only the module directory (or only the single file) for that module.
- Keep public APIs stable by re-exporting from mod.rs as needed.

# Cleanup Checklist

- Remove unused imports in new modules.
- Verify mod.rs re-exports cover all public items.
- Update lib.rs or parent mod.rs to point to the new module path.
- Confirm only the .bak archive remains for the original monolith.
- Run a quick build or targeted tests if applicable.
