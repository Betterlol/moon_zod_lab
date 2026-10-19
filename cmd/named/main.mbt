///|
suberror ArgumentError {
  ArgumentError(String)
} derive(Debug)

///|
fn parse_integer(text : String) -> Result[Int32, String] {
  let value = @json.parse(text) catch {
    _ => return Err("invalid integer: \{text}")
  }
  guard value is Number(number, ..) else {
    return Err("invalid integer: \{text}")
  }
  if number < 0 || number > 2147483647 || number != number.to_int().to_double() {
    return Err("integer out of range: \{text}")
  }
  Ok(number.to_int())
}

///|
fn argument_integer(text : String) -> Int32 raise ArgumentError {
  match parse_integer(text) {
    Ok(value) => value
    Err(message) => raise ArgumentError(message)
  }
}

///|
fn run() -> Unit raise ArgumentError {
  let args = @env.args()
  guard args.length() >= 5 else {
    raise ArgumentError("Usage: named SHAPE SIZE SAMPLES WARMUP")
  }
  let offset = args.length() - 4
  let shape = args[offset]
  guard ["independent", "chain", "tree", "shared_dag"].contains(shape) else {
    raise ArgumentError("unknown graph shape: \{shape}")
  }
  let size = argument_integer(args[offset + 1])
  let samples = argument_integer(args[offset + 2])
  let warmup = argument_integer(args[offset + 3])
  guard size > 0 && samples >= 2 && warmup >= 0 else {
    raise ArgumentError("size > 0, samples >= 2 and warmup >= 0 required")
  }
  let graph = @bench_named.build(shape, size)
  let collected = @core.collect_named_schemas(graph.root)
  guard collected.length() == size else { abort("wrong named count") }
  let sorted = @core.topological_sort_schemas(collected)
  guard @bench_named.verify_order(graph, sorted) else { abort("invalid order") }
  let exported = @exporters.to_json_schema_named(
    graph.root,
    include_names=Some(graph.names),
  )
  let prompt = @exporters.schema_to_prompt_named(
    graph.root,
    include_names=Some(graph.names),
  )
  let code = @exporters.schema_to_moon_zod_code_named(
    graph.root,
    include_names=Some(graph.names),
  )
  let bench = @bench.Bench()
  let stages : Array[(String, () -> Unit)] = [
    ("collect", fn() { bench.keep(@core.collect_named_schemas(graph.root)) }),
    (
      "topological_sort",
      fn() { bench.keep(@core.topological_sort_schemas(collected)) },
    ),
    (
      "json_schema_build",
      fn() {
        bench.keep(
          @exporters.to_json_schema_named(
            graph.root,
            include_names=Some(graph.names),
          ),
        )
      },
    ),
    ("json_serialize", fn() { bench.keep(exported.stringify()) }),
    (
      "prompt",
      fn() {
        bench.keep(
          @exporters.schema_to_prompt_named(
            graph.root,
            include_names=Some(graph.names),
          ),
        )
      },
    ),
    (
      "moon_zod_code",
      fn() {
        bench.keep(
          @exporters.schema_to_moon_zod_code_named(
            graph.root,
            include_names=Some(graph.names),
          ),
        )
      },
    ),
  ]
  for (name, stage) in stages {
    for _ in 0..<warmup {
      stage()
    }
    bench.bench(name~, stage, count=samples.reinterpret_as_uint())
  }
  let summary = @json.parse(bench.dump_summaries()) catch {
    _ => raise ArgumentError("internal benchmark summary is invalid JSON")
  }
  let result : Json = {
    "library": "MoonZod",
    "shape": Json(shape),
    "size": Json(size),
    "named_count": Json(collected.length()),
    "order_verified": true,
    "samples": Json(samples),
    "warmup": Json(warmup),
    "timings": summary,
    "schema": exported,
    "prompt_chars": Json(prompt.length()),
    "code_chars": Json(code.length()),
  }
  println("JSON:\{result.stringify()}")
}

///|
fn main raise {
  run() catch {
    ArgumentError(message) => {
      println("ERROR: \{message}")
      raise ArgumentError(message)
    }
  }
}
