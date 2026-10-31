import pathlib
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class DataToolChecks(unittest.TestCase):
    def test_refresh_tools_compile_without_running_network_requests(self):
        for path in (ROOT / 'scripts').glob('data-*.py'):
            compile(path.read_text(), str(path), 'exec')

    def test_old_facts_cannot_overwrite_a_new_catalogue(self):
        with tempfile.TemporaryDirectory(prefix='reelillion-data-check-') as directory:
            project = pathlib.Path(directory)
            scripts = project / 'scripts'
            data = project / 'src' / 'data'
            scripts.mkdir()
            data.mkdir(parents=True)
            for name in ('data-refresh.py', 'data-finalize.py'):
                shutil.copyfile(ROOT / 'scripts' / name, scripts / name)
            fixtures = {
                'movies.json': '[{"id":"Qnew"}]\n',
                'prompts.json': '[]\n',
                'facts.json': '{"Qold":{}}\n',
            }
            for name, content in fixtures.items():
                (data / name).write_text(content)
            result = subprocess.run(
                ['python3', str(scripts / 'data-finalize.py')],
                text=True, capture_output=True, timeout=10,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('does not cover this exact movie snapshot', result.stderr)
            for name, content in fixtures.items():
                self.assertEqual((data / name).read_text(), content)
            self.assertFalse((data / 'metadata.json').exists())


if __name__ == '__main__':
    unittest.main()
