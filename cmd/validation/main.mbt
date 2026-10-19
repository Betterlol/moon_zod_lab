///|
/// Validate data using raw pattern matching (handcrafted baseline).
fn validate_data(json : Json) -> Bool {
  match json {
    Object(map) =>
      match (map.get("users"), map.get("config")) {
        (Some(users), Some(config)) =>
          validate_users(users) && validate_config(config)
        _ => false
      }
    _ => false
  }
}

///|
fn validate_config(json : Json) -> Bool {
  match json {
    Object(fields) => {
      match fields.get("version") {
        Some(String(s)) => if s.length() < 1 { return false }
        _ => return false
      }
      match fields.get("debug") {
        Some(True) | Some(False) => ()
        _ => return false
      }
      match fields.get("maxRetries") {
        Some(Number(v, ..)) =>
          if v != v.to_int().to_double() || v < 0.0 || v > 10.0 {
            return false
          }
        _ => return false
      }
      true
    }
    _ => false
  }
}

///|
fn validate_users(json : Json) -> Bool {
  match json {
    Array(users) => {
      for user in users {
        if !validate_user(user) {
          return false
        }
      }
      true
    }
    _ => false
  }
}

///|
fn validate_user(json : Json) -> Bool {
  match json {
    Object(fields) => {
      match fields.get("id") {
        Some(Number(v, ..)) =>
          if v != v.to_int().to_double() || v < 0.0 {
            return false
          }
        _ => return false
      }
      match fields.get("name") {
        Some(String(s)) =>
          if s.length() < 1 || s.length() > 100 {
            return false
          }
        _ => return false
      }
      match fields.get("email") {
        Some(Null) | None => ()
        Some(String(s)) => if !has_at_and_dot(s) { return false }
        _ => return false
      }
      match fields.get("role") {
        Some(String(s)) =>
          if s != "admin" && s != "user" && s != "viewer" {
            return false
          }
        _ => return false
      }
      match fields.get("profile") {
        Some(p) => validate_profile(p)
        _ => false
      }
    }
    _ => false
  }
}

///|
fn validate_profile(json : Json) -> Bool {
  match json {
    Object(fields) => {
      match fields.get("age") {
        Some(Number(v, ..)) =>
          if v != v.to_int().to_double() || v < 0.0 || v > 150.0 {
            return false
          }
        _ => return false
      }
      match fields.get("tags") {
        Some(Array(tags)) =>
          for tag in tags {
            match tag {
              String(s) => if s.length() < 1 { return false }
              _ => return false
            }
          }
        _ => return false
      }
      match fields.get("metadata") {
        Some(Null) | None => ()
        Some(m) => if !validate_metadata(m) { return false }
      }
      true
    }
    _ => false
  }
}

///|
fn validate_metadata(json : Json) -> Bool {
  match json {
    Object(fields) => {
      match fields.get("department") {
        Some(String(s)) => if s.length() < 1 { return false }
        _ => return false
      }
      match fields.get("level") {
        Some(Number(v, ..)) =>
          if v != v.to_int().to_double() || v < 1.0 || v > 10.0 {
            return false
          }
        _ => return false
      }
      match fields.get("active") {
        Some(True) | Some(False) => ()
        _ => return false
      }
      true
    }
    _ => false
  }
}

///|
fn has_at_and_dot(s : String) -> Bool {
  let chars = s.to_array()
  let mut at_pos = -1
  for i, c in chars {
    if c == '@' {
      at_pos = i
      break
    }
  }
  if at_pos <= 0 {
    return false
  }
  for i = at_pos + 1; i < chars.length(); i = i + 1 {
    if chars[i] == '.' && i > at_pos + 1 && i < chars.length() - 1 {
      return true
    }
  }
  false
}

///|
/// Select a shared benchmark fixture from the JSON envelope supplied by the runner.
fn fixture_input(custom : Json?, name : String, fallback : Json) -> Json {
  match custom {
    None => fallback
    Some(Object(fixtures)) =>
      match fixtures.get(name) {
        Some(value) => value
        None => abort("Missing benchmark fixture: " + name)
      }
    Some(_) => abort("Benchmark fixtures must be a JSON object")
  }
}

///|
/// Node.js retains its executable and script name in process.argv.
#cfg(target="js")
fn argument_offset() -> Int32 {
  2
}

///|
/// Native and WASI arguments contain just one executable prefix.
#cfg(not(target="js"))
fn argument_offset() -> Int32 {
  1
}

///|
/// Benchmark validation only; schema construction, JSON decoding, process startup,
/// and compilation are outside the timed callbacks. The handcrafted baseline is
/// approximate and must never be used as a semantic correctness oracle.
/// Usage: moon run --target js --release cmd/validation -- [--smoke] [--verify] [fixtures-json]
fn main {
  let bench = @bench.Bench()
  let args = @env.args()
  let mut smoke = false
  let mut verify = false
  let mut custom_input : Json? = None
  for i = argument_offset(); i < args.length(); i = i + 1 {
    match args[i] {
      "--smoke" => smoke = true
      "--verify" => verify = true
      "--help" => {
        println(
          "moon run --target js --release cmd/validation -- [--smoke] [--verify] [fixtures-json]",
        )
        return
      }
      input => {
        if custom_input is Some(_) {
          abort("Only one fixtures JSON argument is supported")
        }
        custom_input = Some(
          @json.parse(input) catch {
            _ => abort("Invalid fixtures JSON")
          },
        )
      }
    }
  }
  let sample_count : UInt32 = if smoke { 2U } else { 10U }

  // ── Shared schema and input ───────────────────────────────────────
  let schema = @moon_zod.object({
    "users": @moon_zod.array(
      @moon_zod.object({
        "id": @moon_zod.number().int().min(0),
        "name": @moon_zod.string().min(1).max(100),
        "email": @moon_zod.string().email().optional(),
        "role": @moon_zod.enum_values(["admin", "user", "viewer"]),
        "profile": @moon_zod.object({
          "age": @moon_zod.number().int().min(0).max(150),
          "tags": @moon_zod.array(@moon_zod.string().min(1)),
          "metadata": @moon_zod.object({
            "department": @moon_zod.string().min(1),
            "level": @moon_zod.number().int().min(1).max(10),
            "active": @moon_zod.boolean(),
          }).optional(),
        }),
      }),
    ),
    "config": @moon_zod.object({
      "version": @moon_zod.string().min(1),
      "debug": @moon_zod.boolean(),
      "maxRetries": @moon_zod.number().int().min(0).max(10),
    }),
  })

  let large_input : Json = fixture_input(
    custom_input,
    "valid",
    Json::object({
      "users": Json::array([
        Json::object({
          "id": Json::number(1.0),
          "name": Json::string("Alice"),
          "email": Json::string("alice@example.com"),
          "role": Json::string("admin"),
          "profile": Json::object({
            "age": Json::number(30.0),
            "tags": Json::array([
              Json::string("rust"),
              Json::string("wasm"),
              Json::string("ai"),
            ]),
            "metadata": Json::object({
              "department": Json::string("Engineering"),
              "level": Json::number(5.0),
              "active": Json::boolean(true),
            }),
          }),
        }),
        Json::object({
          "id": Json::number(2.0),
          "name": Json::string("Bob"),
          "role": Json::string("user"),
          "profile": Json::object({
            "age": Json::number(25.0),
            "tags": Json::array([Json::string("design")]),
            "metadata": Json::object({
              "department": Json::string("Design"),
              "level": Json::number(3.0),
              "active": Json::boolean(false),
            }),
          }),
        }),
        Json::object({
          "id": Json::number(3.0),
          "name": Json::string("Charlie"),
          "role": Json::string("viewer"),
          "profile": Json::object({
            "age": Json::number(42.0),
            "tags": Json::array([Json::string("python"), Json::string("data")]),
          }),
        }),
      ]),
      "config": Json::object({
        "version": Json::string("1.0.0"),
        "debug": Json::boolean(false),
        "maxRetries": Json::number(3.0),
      }),
    }),
  )

  // Any unexpected outcome fails the process, including smoke and verify mode.
  match schema.parse(large_input) {
    Ok(_) => ()
    Err(_) => abort("Valid fixture unexpectedly failed moon_zod validation")
  }
  if !validate_data(large_input) {
    abort("Approximate handcrafted baseline rejected the valid fixture")
  }

  // Adversarial
  let adv_input = fixture_input(
    custom_input,
    "adversarial",
    Json::object({
      "users": Json::array([
        Json::object({
          "name": Json::string(""),
          "email": Json::string("not-an-email"),
          "role": Json::string("superuser"),
          "profile": Json::object({
            "age": Json::number(-5.0),
            "tags": Json::array([]),
          }),
        }),
        Json::object({ "id": Json::number(99.0), "role": Json::number(123.0) }),
      ]),
      "config": Json::object({
        "version": Json::string(""),
        "debug": Json::number(1.0),
        "maxRetries": Json::number(999.0),
      }),
    }),
  )
  match schema.parse(adv_input) {
    Err(errors) => {
      let mut count = 0
      for _ in errors {
        count = count + 1
      }
      println("Adversarial: \{count} errors generated (expected)")
    }
    Ok(_) => abort("Adversarial fixture unexpectedly passed")
  }
  // Extreme Redundancy
  let redundant_map : Map[String, Json] = match large_input {
    Object(fields) => fields.copy()
    _ => abort("Valid fixture must be an object")
  }
  for i = 0; i < 105; i = i + 1 {
    redundant_map.set("h_field_\{i}", Json::string("hallucinated_value_\{i}"))
  }
  let redundant_input = fixture_input(
    custom_input,
    "redundant",
    Json::object(redundant_map),
  )
  match schema.parse(redundant_input) {
    Ok(cleaned) =>
      match cleaned {
        Object(map) => {
          let mut spec_count = 0
          for _ in map.keys() {
            spec_count = spec_count + 1
          }
          if spec_count != 2 {
            abort("Strip mode must preserve exactly users and config")
          }
          println("Strip: only the two declared root fields remain")
        }
        _ => abort("Cleaned result must be an object")
      }
    Err(_) => abort("Redundant fixture unexpectedly failed")
  }
  if verify {
    println(
      "JSON:{\"valid\":true,\"adversarial\":false,\"redundant\":true,\"strippedRootFields\":true}",
    )
    return
  }
  bench.bench(name="Valid Throughput (moon_zod)", count=sample_count, fn() {
    bench.keep(schema.parse(large_input))
  })
  bench.bench(name="Adversarial (moon_zod)", count=sample_count, fn() {
    bench.keep(schema.parse(adv_input))
  })
  bench.bench(name="Extreme Redundancy (moon_zod)", count=sample_count, fn() {
    bench.keep(schema.parse(redundant_input))
  })
  bench.bench(
    name="Valid Throughput (handcrafted approximate)",
    count=sample_count,
    fn() { bench.keep(validate_data(large_input)) },
  )
  // Installed core/bench already reports microseconds per operation.
  // batch_size describes calibration and must not divide mean a second time.
  println("JSON:\{bench.dump_summaries()}")
}
