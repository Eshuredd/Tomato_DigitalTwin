from __future__ import annotations

import unittest

from check_backend_schema import assert_schemas_match


class SchemaComparisonTests(unittest.TestCase):
    def test_matching_schema_succeeds(self) -> None:
        schema = {"openapi": "3.1.0", "paths": {"/health": {"get": {}}}}
        assert_schemas_match(schema, dict(schema))

    def test_changed_snapshot_fails(self) -> None:
        actual = {"openapi": "3.1.0", "paths": {"/health": {"get": {}}}}
        changed = {"openapi": "3.1.0", "paths": {}}
        with self.assertRaisesRegex(AssertionError, "differs semantically"):
            assert_schemas_match(actual, changed)


if __name__ == "__main__":
    unittest.main()
