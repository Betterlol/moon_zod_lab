"""Named-schema JSON export benchmark. Model construction is never timed."""

import argparse
import json
import platform
import statistics
import sys
import time

import pydantic
from pydantic import ConfigDict, create_model


SHAPES = ("independent", "chain", "tree", "shared_dag")


def dependencies(shape, index):
    if index == 0 or shape == "independent":
        return []
    if shape == "chain":
        return [index - 1]
    if shape == "tree":
        return [(index - 1) // 2]
    return sorted({0, index // 2})


def build_models(shape, size):
    nodes = []
    config = ConfigDict(extra="forbid", strict=True)
    for index in range(size):
        fields = {"value": (str, ...)}
        fields.update({f"dep{dep}": (nodes[dep], ...) for dep in dependencies(shape, index)})
        nodes.append(create_model(f"Node{index}", __config__=config, **fields))
    return create_model("Envelope", __config__=config,
                        **{f"node{index}": (model, ...) for index, model in enumerate(nodes)})


def measure(callback, samples, warmup):
    retained = None
    for _ in range(warmup):
        retained = callback()
    # Calibrate each batch to approximately 50 ms, outside recorded samples.
    batch_size = 1
    while True:
        start = time.perf_counter_ns()
        for _ in range(batch_size):
            retained = callback()
        elapsed = time.perf_counter_ns() - start
        if elapsed >= 50_000_000 or batch_size >= 1_048_576:
            break
        batch_size *= 2
    values = []
    for _ in range(samples):
        start = time.perf_counter_ns()
        for _ in range(batch_size):
            retained = callback()
        values.append((time.perf_counter_ns() - start) / batch_size / 1000)
    return {"mean_us": statistics.mean(values), "median_us": statistics.median(values),
            "min_us": min(values), "max_us": max(values), "samples_us": values,
            "batch_size": batch_size, "runs": samples}, retained


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shape", choices=SHAPES, required=True)
    parser.add_argument("--size", type=int, required=True)
    parser.add_argument("--samples", type=int, default=5)
    parser.add_argument("--warmup", type=int, default=2)
    args = parser.parse_args()
    if args.size < 1 or args.samples < 2 or args.warmup < 0:
        parser.error("size > 0, samples >= 2, and warmup >= 0 required")
    if int(pydantic.__version__.split(".")[0]) != 2:
        parser.error("Pydantic v2 is required")
    sys.setrecursionlimit(max(10000, args.size * 30))
    root = build_models(args.shape, args.size)
    outputs = []
    for mode in ("validation", "serialization"):
        build_stats, schema = measure(lambda: root.model_json_schema(mode=mode), args.samples, args.warmup)
        if len(schema.get("$defs", {})) != args.size:
            raise RuntimeError("Pydantic exported a different number of named nodes")
        serialize_stats, serialized = measure(lambda: json.dumps(schema, separators=(",", ":")),
                                              args.samples, args.warmup)
        outputs.append({"library": "Pydantic", "mode": mode, "shape": args.shape, "size": args.size,
                        "recursion_limit": sys.getrecursionlimit(),
                        "named_count": len(schema["$defs"]), "schema": schema,
                        "timings": {"json_schema_build": build_stats, "json_serialize": serialize_stats},
                        "output_bytes": len(serialized.encode("utf-8"))})
    print(json.dumps({"version": pydantic.__version__, "python": platform.python_version(),
                      "samples": args.samples, "warmup": args.warmup, "results": outputs}, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except (RecursionError, RuntimeError, ValueError) as error:
        print(f"Pydantic benchmark failed: {error}", file=sys.stderr)
        sys.exit(1)
