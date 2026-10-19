///|
/// Direct factory adapters. This executable deliberately never calls a schema importer.
fn factory(id : String) -> @moon_zod.Schema {
  match id {
    "string-bounds" => @moon_zod.string().min(2).max(5)
    "string-pattern" => @moon_zod.string().regex("^[a-z]+$")
    "email" => @moon_zod.string().email()
    "integer-bounds" => @moon_zod.number().int().min(0).max(10).multipleOf(2)
    "positive" => @moon_zod.number().positive()
    "array-bounds" => @moon_zod.array(@moon_zod.number().int()).min(1).max(3)
    "optional-default" =>
      @moon_zod.object({
        "required": @moon_zod.string(),
        "optional": @moon_zod.string().min(2).optional(),
        "default": @moon_zod.number().min(0).default(Json::number(7)),
      }).strict()
    "root-default" => @moon_zod.number().min(0).default(Json::number(7))
    "tuple" => @moon_zod.tuple([@moon_zod.string(), @moon_zod.number().int()])
    "strict" => @moon_zod.object({ "x": @moon_zod.number() }).strict()
    "strip" => @moon_zod.object({ "x": @moon_zod.number() }).strip()
    "passthrough" => @moon_zod.object({ "x": @moon_zod.number() }).passthrough()
    "named-shared" => {
      let leaf = @moon_zod.string().min(2).name("Leaf")
      let address = @moon_zod.object({ "city": leaf }).strict().name("Address")
      @moon_zod.object({ "home": address, "work": address })
      .strict()
      .name("Person")
    }
    "named-slash" =>
      @moon_zod.object({ "x": @moon_zod.string().name("Leaf/name") }).strict()
    "named-tilde" =>
      @moon_zod.object({ "x": @moon_zod.string().name("Leaf~1name") }).strict()
    "object-intersection" =>
      @moon_zod.intersection([
        @moon_zod.object({ "a": @moon_zod.string().min(2) }),
        @moon_zod.object({ "b": @moon_zod.number().int() }),
      ])
    "strict-intersection" =>
      @moon_zod.intersection([
        @moon_zod.object({ "a": @moon_zod.string() }).strict(),
        @moon_zod.object({ "b": @moon_zod.number() }).strict(),
      ])
    "refinement" =>
      @moon_zod.number().refine(
        fn(value) { value != Json::number(3) },
        "three is forbidden",
      )
    "custom-transform" =>
      @moon_zod.string().transform(fn(value) {
        if value == Json::string("reject") {
          Err("rejected by transform")
        } else {
          Ok(Json::number(42))
        }
      })
    "preprocess" =>
      @moon_zod.preprocess(
        fn(value) {
          if value == Json::string("42") {
            Ok(Json::number(42))
          } else {
            Ok(value)
          }
        },
        @moon_zod.number(),
      )
    "official-complex-object" =>
      @moon_zod.object({
        "name": @moon_zod.string(),
        "age": @moon_zod.number().int().min(0),
        "address": @moon_zod.object({
          "street": @moon_zod.string(),
          "city": @moon_zod.string(),
          "state": @moon_zod.string(),
          "postalCode": @moon_zod.string().regex("\\d{5}"),
        })
        .passthrough()
        .optional(),
        "hobbies": @moon_zod.array(@moon_zod.string()).optional(),
      }).passthrough()
    "type:0" => @moon_zod.number().int()
    "type:1" => @moon_zod.number()
    "type:2" | "type:8" => @moon_zod.string()
    "type:3" => @moon_zod.object({}).passthrough()
    "type:4" => @moon_zod.array(@moon_zod.any())
    "type:5" => @moon_zod.boolean()
    "type:6" => @moon_zod.null()
    "type:7" => @moon_zod.union([@moon_zod.number().int(), @moon_zod.string()])
    "type:9" =>
      @moon_zod.union([
        @moon_zod.array(@moon_zod.any()),
        @moon_zod.object({}).passthrough(),
      ])
    "type:10" =>
      @moon_zod.union([
        @moon_zod.array(@moon_zod.any()),
        @moon_zod.object({}).passthrough(),
        @moon_zod.null(),
      ])
    "enum:0" =>
      @moon_zod.union([
        @moon_zod.literal(Json::number(1)),
        @moon_zod.literal(Json::number(2)),
        @moon_zod.literal(Json::number(3)),
      ])
    "enum:4" => @moon_zod.enum_values(["foo\nbar", "foo\rbar"])
    "enum:5" => @moon_zod.literal(Json::boolean(false))
    "enum:7" => @moon_zod.literal(Json::boolean(true))
    "enum:9" => @moon_zod.literal(Json::number(0))
    "enum:11" => @moon_zod.literal(Json::number(1))
    "enum:15" => @moon_zod.enum_values(["ä"])
    "const:0" => @moon_zod.literal(Json::number(2))
    "const:1" =>
      @moon_zod.literal(
        Json::object({ "foo": Json::string("bar"), "baz": Json::string("bax") }),
      )
    "const:2" =>
      @moon_zod.literal(
        Json::array([Json::object({ "foo": Json::string("bar") })]),
      )
    "const:3" => @moon_zod.literal(Json::null())
    "const:4" => @moon_zod.literal(Json::boolean(false))
    "const:5" => @moon_zod.literal(Json::boolean(true))
    "const:6" => @moon_zod.literal(Json::array([Json::boolean(false)]))
    "const:7" => @moon_zod.literal(Json::array([Json::boolean(true)]))
    "const:8" => @moon_zod.literal(Json::object({ "a": Json::boolean(false) }))
    "const:9" => @moon_zod.literal(Json::object({ "a": Json::boolean(true) }))
    "const:10" => @moon_zod.literal(Json::number(0))
    "const:11" => @moon_zod.literal(Json::number(1))
    "const:12" => @moon_zod.literal(Json::number(-2))
    "minimum:1" =>
      @moon_zod.union([
        @moon_zod.number().min(-2),
        @moon_zod.string(),
        @moon_zod.boolean(),
        @moon_zod.null(),
        @moon_zod.array(@moon_zod.any()),
        @moon_zod.object({}).passthrough(),
      ])
    "minLength:0" | "minLength:1" =>
      @moon_zod.union([
        @moon_zod.string().min(2),
        @moon_zod.number(),
        @moon_zod.boolean(),
        @moon_zod.null(),
        @moon_zod.array(@moon_zod.any()),
        @moon_zod.object({}).passthrough(),
      ])
    _ => abort("No direct factory adapter for " + id)
  }
}

///|
fn evaluate(id : String, samples : Array[Json]) -> Json {
  let schema = factory(id)
  let verdicts = samples.map(fn(input) {
    // Each parse gets a fresh JSON tree: intersections may mutate maps.
    let data = @json.parse(input.stringify()) catch {
      _ => abort("Invalid sample")
    }
    match schema.parse(data) {
      Ok(output) =>
        Json::object({ "runtime": Json::boolean(true), "output": output })
      Err(errors) =>
        Json::object({
          "runtime": Json::boolean(false),
          "errors": Json::array(
            errors.map(fn(error) { Json::string(error.to_string()) }),
          ),
        })
    }
  })
  let result = Json::object({
    "id": Json::string(id),
    "full": @moon_zod.to_json_schema(schema),
    "named": @moon_zod.to_json_schema_named(schema),
    "skeleton": @moon_zod.to_json_schema_skeleton(schema),
    "verdicts": Json::array(verdicts),
  })
  if id == "named-shared" {
    match result {
      Object(map) =>
        map.set(
          "filtered",
          @moon_zod.to_json_schema_named(
            schema,
            include_names=Some(["Address"]),
          ),
        )
      _ => ()
    }
  }
  result
}

///|
fn main {
  let args = @env.args()
  if args.length() < 2 {
    println("ERROR: expected one JSON request array")
    return
  }
  let requests = @json.parse(args[args.length() - 1]) catch {
    _ => {
      println("ERROR: invalid JSON request")
      return
    }
  }
  let output : Array[Json] = []
  match requests {
    Array(items) =>
      for item in items {
        match item {
          Object(map) =>
            match (map.get("id"), map.get("samples")) {
              (Some(String(id)), Some(Array(samples))) =>
                output.push(evaluate(id, samples))
              _ => {
                println("ERROR: request requires id and samples")
                return
              }
            }
          _ => {
            println("ERROR: request must be an object")
            return
          }
        }
      }
    _ => {
      println("ERROR: requests must be an array")
      return
    }
  }
  println("JSON:" + Json::array(output).stringify())
}
