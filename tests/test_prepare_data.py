import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from prepare_data import prepare  # noqa: E402


class PrepareDataTests(unittest.TestCase):
    def test_dataset_totals_and_core_rules(self):
        with tempfile.TemporaryDirectory() as directory:
            result = prepare(ROOT / "data" / "raw" / "apartamentos_akila.csv", Path(directory))
        self.assertEqual(result["kpis"]["total"], 457)
        self.assertEqual(result["kpis"]["sold"], 271)
        self.assertEqual(result["kpis"]["available"], 186)
        self.assertEqual(result["kpis"]["product_types"], 5)
        self.assertEqual(result["quality"]["errors"], 0)
        self.assertGreater(result["quality"]["duplicate_apartment_names"], 0)


if __name__ == "__main__":
    unittest.main()
