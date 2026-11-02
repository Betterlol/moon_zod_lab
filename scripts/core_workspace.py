"""Isolated workspaces for the optional MoonZod 0.10 validation scripts.

The lab's normal Mooncakes dependency remains unchanged. By default these
checks use that installed module; --moon-zod-path selects an unpublished source
checkout explicitly. Producers and consumers are always built in lab/tmp.
"""

from contextlib import contextmanager
import re
from pathlib import Path
import shutil
import subprocess
import tempfile


LAB_ROOT = Path(__file__).resolve().parents[1]


def add_source_argument(parser):
    parser.add_argument(
        "--moon-zod-path", type=Path,
        help="MoonZod 0.10+ source checkout; default: the lab's installed Mooncakes module",
    )


class Workspace:
    def __init__(self, root, source, version):
        self.root = root
        self.source = source
        self.version = version
        self.scratch = root / "tmp"
        self.scratch.mkdir()

    def moon(self, *args):
        result = subprocess.run(
            ["moon", *args], cwd=self.root, capture_output=True, encoding="utf-8",
        )
        if result.returncode:
            raise RuntimeError(f"moon {' '.join(args)}\n{result.stdout}\n{result.stderr}")
        return result.stdout

    def package(self, directory):
        directory.mkdir()
        (directory / "moon.pkg").write_text(
            'import { "Betterlol/moon_zod" }\n', encoding="utf-8",
        )
        return directory.relative_to(self.root).as_posix()


def source_manifest(source):
    manifest = source / "moon.mod"
    if not manifest.is_file():
        raise ValueError(f"MoonZod moon.mod not found: {manifest}")
    text = manifest.read_text(encoding="utf-8")
    if not re.search(r'^name\s*=\s*"Betterlol/moon_zod"\s*$', text, re.M):
        raise ValueError(f"Expected the Betterlol/moon_zod module: {manifest}")
    match = re.search(r'^version\s*=\s*"(\d+)\.(\d+)\.(\d+)(?:[+-][^"]*)?"', text, re.M)
    if not match or tuple(map(int, match.groups())) < (0, 10, 0):
        raise ValueError(
            "These migration checks require MoonZod 0.10.0+. Install that published "
            "version with moon add, or pass --moon-zod-path for a prerelease checkout."
        )
    return '.'.join(match.groups())


@contextmanager
def workspace(source=None, *, lab_root=LAB_ROOT):
    source = (source or lab_root / '.mooncakes/Betterlol/moon_zod').resolve()
    version = source_manifest(source)
    dependencies = source / '.mooncakes'
    if not dependencies.is_dir():
        dependencies = lab_root / '.mooncakes'
    if not dependencies.is_dir():
        raise ValueError("Install the selected source's Mooncakes dependencies first.")
    scratch = lab_root / 'tmp'
    scratch.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='core_checks_', dir=scratch) as temporary:
        root = Path(temporary)
        for path in source.iterdir():
            if path.is_file() and (path.suffix == '.mbt' or path.name in ('moon.mod', 'moon.pkg')):
                shutil.copy2(path, root / path.name)
        ignore = shutil.ignore_patterns('_build', '.git', '.mooncakes', 'tmp', '__pycache__')
        for name in ('core', 'exporters', 'importers', 'combinators', 'async'):
            if (source / name).is_dir():
                shutil.copytree(source / name, root / name, ignore=ignore)
        shutil.copytree(dependencies, root / '.mooncakes', ignore=ignore)
        yield Workspace(root, source, version)
