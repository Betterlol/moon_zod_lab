///|
test "shared envelope fixtures replace defaults" {
  let envelope = Some(Json::object({ "valid": Json::number(42.0) }))
  assert_eq(fixture_input(envelope, "valid", Json::null()), Json::number(42.0))
  assert_eq(
    fixture_input(None, "valid", Json::boolean(true)),
    Json::boolean(true),
  )
}

///|
test "handcrafted baseline is approximate for optional null" {
  let data : Json = {
    "users": [
      {
        "id": 1,
        "name": "Alice",
        "email": null,
        "role": "user",
        "profile": { "age": 30, "tags": ["test"], "metadata": null },
      },
    ],
    "config": { "version": "1", "debug": false, "maxRetries": 3 },
  }
  // This shortcut accepts null optionals while Zod optional() means undefined.
  // Recording that limitation prevents treating the baseline as an oracle.
  assert_true(validate_data(data))
  assert_true(!validate_data(Json::null()))
}
