from pathlib import Path
import tempfile
import unittest

from core_workspace import source_manifest, workspace


class CoreWorkspaceTests(unittest.TestCase):
    def test_old_published_version_requires_explicit_upgrade(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            (source / 'moon.mod').write_text('name = "Betterlol/moon_zod"\nversion = "0.9.0"\n')
            with self.assertRaisesRegex(ValueError, '0.10.0'):
                source_manifest(source)

    def test_unrelated_module_is_rejected_before_creating_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'
            source.mkdir()
            (source / 'moon.mod').write_text('name = "other/module"\nversion = "1.0.0"\n')
            with self.assertRaisesRegex(ValueError, 'Betterlol/moon_zod'):
                with workspace(source, lab_root=root):
                    self.fail('unexpected workspace')
            self.assertFalse((root / 'tmp').exists())

    def test_isolated_build_artifacts_do_not_modify_selected_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'
            source.mkdir()
            (source / 'moon.mod').write_text('name = "Betterlol/moon_zod"\nversion = "0.10.0"\n')
            (source / 'moon.pkg').write_text('import {}\n')
            (source / 'core').mkdir()
            original = '///|\npub fn value() -> Int { 1 }\n'
            (source / 'core/value.mbt').write_text(original)
            (source / '.mooncakes').mkdir()
            (source / '.mooncakes/dependency').write_text('unchanged')
            with workspace(source, lab_root=root) as work:
                generated = work.root
                self.assertNotEqual(work.root, source)
                self.assertEqual(work.package(work.scratch / 'producer'), 'tmp/producer')
                (work.root / 'core/value.mbt').write_text('modified only in temporary copy')
                (work.root / '_build').mkdir()
                (work.root / '.mooncakes/dependency').write_text('temporary')
            self.assertFalse(generated.exists())
            self.assertFalse((source / '_build').exists())
            self.assertEqual((source / 'core/value.mbt').read_text(), original)
            self.assertEqual((source / '.mooncakes/dependency').read_text(), 'unchanged')


if __name__ == '__main__':
    unittest.main()
