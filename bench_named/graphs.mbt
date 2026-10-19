///|
/// A deterministic DAG containing exactly `nodes.length()` named schemas.
/// The unnamed root is an envelope referencing every node.
pub(all) struct Graph {
  root : @core.Schema
  nodes : Array[@core.Schema]
  names : Array[String]
  edges : Array[Array[Int32]]
}

///|
/// Direct dependency indices for a benchmark node. All edges point backwards.
pub fn dependencies(shape : String, i : Int32) -> Array[Int32] {
  if i == 0 || shape == "independent" {
    return []
  }
  match shape {
    "chain" => [i - 1]
    "tree" => [(i - 1) / 2]
    "shared_dag" => if i / 2 == 0 { [0] } else { [0, i / 2] }
    _ => abort("unknown graph shape")
  }
}

///|
/// Build the schema fixture outside timed exporter callbacks.
pub fn build(shape : String, size : Int32) -> Graph {
  guard size > 0 else { abort("graph size must be positive") }
  guard ["independent", "chain", "tree", "shared_dag"].contains(shape) else {
    abort("unknown graph shape")
  }
  let nodes : Array[@core.Schema] = []
  let names : Array[String] = []
  let edges : Array[Array[Int32]] = []
  let envelope : Map[String, @core.Schema] = Map([])
  for i in 0..<size {
    let deps = dependencies(shape, i)
    let fields : Map[String, @core.Schema] = { "value": @core.string() }
    for d in deps {
      fields.set("dep\{d}", nodes[d])
    }
    let name = "Node\{i}"
    let node = @core.object(fields).strict().name(name)
    nodes.push(node)
    names.push(name)
    edges.push(deps)
    envelope.set("node\{i}", node)
  }
  { root: @core.object(envelope).strict(), nodes, names, edges, }
}

///|
/// Verify unique names and that each direct dependency precedes its consumer.
pub fn verify_order(graph : Graph, ordered : Array[@core.Schema]) -> Bool {
  if ordered.length() != graph.nodes.length() {
    return false
  }
  let positions : Map[String, Int32] = Map([])
  for i, node in ordered {
    if positions.contains(node.name) {
      return false
    }
    positions.set(node.name, i)
  }
  for i, deps in graph.edges {
    guard positions.get(graph.names[i]) is Some(position) else { return false }
    for d in deps {
      guard positions.get(graph.names[d]) is Some(dependency_position) else {
        return false
      }
      if dependency_position >= position {
        return false
      }
    }
  }
  true
}
