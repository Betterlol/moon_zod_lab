# moon_zod_lab

Independent MoonZod exporter validation and benchmark laboratory.

- Depend on published Mooncakes modules through `moon add` and package `import` declarations.
- Inspect existing patterns first. MoonBit blocks and public documentation use `///|`.
- Parse runtime data with Result, never abort on malformed input.
- Use direct MoonZod factories for exporter tests; importer round trips are a separate test category.
- Pin upstream fixtures and dependencies; tests run offline after dependencies are installed.
- Unsupported features and documented semantic differences must be explicit in reports. Unknown regressions fail.
- Benchmarks build schemas outside export/validation timers, consume outputs, and record environment and units.
- The installed core/bench summary mean is microseconds per operation; batch_size is metadata, not a divisor.
- Run relevant MoonBit and external tests, then `moon info` and `moon fmt` scoped to this module. Inspect `.mbti` diffs.
- Do not commit unrelated files or use `git add .`.
