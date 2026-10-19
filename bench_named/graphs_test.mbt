///|
test "named DAGs collect exactly N unique names and sort dependencies first" {
  for size in [1, 7, 100] {
    for shape in ["independent", "chain", "tree", "shared_dag"] {
      let graph = @bench_named.build(shape, size)
      let collected = @core.collect_named_schemas(graph.root)
      assert_eq(collected.length(), size)
      let unique : Map[String, Bool] = Map([])
      for node in collected {
        unique.set(node.name, true)
      }
      assert_eq(unique.length(), size)
      let sorted = @core.topological_sort_schemas(collected)
      assert_true(@bench_named.verify_order(graph, sorted))
    }
  }
}

///|
test "fixture shapes retain their direct dependency counts" {
  assert_eq(@bench_named.build("independent", 7).edges[6].length(), 0)
  assert_eq(@bench_named.build("chain", 7).edges[6], [5])
  assert_eq(@bench_named.build("tree", 7).edges[6], [2])
  assert_eq(@bench_named.build("shared_dag", 7).edges[6], [0, 3])
  let graph = @bench_named.build("chain", 7)
  assert_true(!@bench_named.verify_order(graph, graph.nodes.rev()))
}

///|
test "named JSON definitions exclude synthetic root and use node refs" {
  for shape in ["independent", "chain", "tree", "shared_dag"] {
    let graph = @bench_named.build(shape, 7)
    let schema = @exporters.to_json_schema_named(
      graph.root,
      include_names=Some(graph.names),
    )
    guard schema is Object(root) else { fail("expected object") }
    guard root.get("$defs") is Some(Object(defs)) else { fail("expected defs") }
    assert_eq(defs.length(), 7)
    assert_true(!defs.contains("Root"))
    guard root.get("properties") is Some(Object(properties)) else {
      fail("expected root properties")
    }
    assert_eq(properties.get("node6"), Some({ "$ref": "#/$defs/Node6" }))
    guard defs.get("Node6") is Some(Object(node)) else { fail("missing Node6") }
    guard node.get("properties") is Some(Object(fields)) else {
      fail("missing properties")
    }
    for d in graph.edges[6] {
      assert_eq(fields.get("dep\{d}"), Some({ "$ref": "#/$defs/Node\{d}" }))
    }
  }
}
