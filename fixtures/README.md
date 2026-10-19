# Exporter fixtures

The harness constructs every schema with direct MoonZod factories in `cmd/export-fixtures`. It does not import the expected JSON Schema into MoonZod, so an importer and exporter cannot hide each other's mistakes.

`export-cases.cjs` covers full, named, filtered named and skeleton exports, rule annotations, optional/default handling, tuple lengths, object modes, shared definitions, special characters in names, intersections, refinements, transformations and preprocessing. Expected differences are attached to an exact case, sample and export mode, with an observed verdict and reason. Unexpected failures and unexpected passes fail the run. Named-reference exceptions also require Ajv's specific missing-reference error and exact reference path.

`official-example.json` records the source URL and representative samples for the official JSON Schema Complex Object example. Its factory uses passthrough objects to preserve JSON Schema's default additional-property semantics. MoonZod optional fields also accept null, so the file explicitly describes the scope of this adaptation.

`upstream/` contains selected, unmodified draft2020-12 files from the official [JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite), pinned by the full commit in `source.json`. The upstream MIT license is retained in `upstream/LICENSE`. `sha256.json` checks file integrity offline. `adapters.json` identifies the reviewed groups by file, index and description. The rest of the downloaded groups are reported as excluded with sample counts and reasons. These counts describe the selected files, not the entire upstream conformance suite.

Refresh deliberately requires an explicit command:

```text
npm run fixtures:sync
```

Normal tests never download fixtures. To change the pin, update `upstream/source.json`, run the refresh, review upstream changes and update direct adapters where necessary. Refreshed content does not automatically become supported coverage.

```text
npm test
node scripts/test-exporters.cjs --self-test
```

The test report in `reports/exporters.json` separates runtime, reference-schema, exported-input, parsed-output, meta-schema and compilation checks. It also records environment versions, the installed MoonZod release version, expected differences, blocked sample evaluation after known reference errors, and excluded upstream groups. Ajv2020 validates the schemas against draft2020-12 and verifies samples independently without coercing input, removing properties or inserting defaults. `ajv-formats` checks the representative email case; this does not claim every format implementation is equivalent.
