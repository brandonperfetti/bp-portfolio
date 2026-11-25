"""Negative controls for historical inventory checks, independent of model access."""

import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from types import SimpleNamespace

SPEC = importlib.util.spec_from_file_location(
    "verify_cover_recipes", Path(__file__).with_name("verify-cover-recipes.py"))
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)
ROOT = Path(__file__).resolve().parents[1]


class InventoryChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / "docs", self.root / "docs")
        covers = self.load("cover-history.json")["covers"]
        prompts = {c["postId"]: c["finalPrompt"] for c in covers}
        # Inventory tests don't substitute for the separate real-skill round-trip.
        self.skill = SimpleNamespace(
            extract_settings=lambda text: {}, validate_settings=lambda value: [],
            render_midjourney=lambda recipe, settings, form: prompts[recipe["id"]])

    def load(self, name):
        return json.loads((self.root / "docs" / name).read_text())

    def write(self, name, value):
        (self.root / "docs" / name).write_text(json.dumps(value))

    def test_complete_inventory(self):
        result = VERIFY.verify(self.root, self.skill)
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["diff"], "")

    def test_missing_recipe_is_not_zero_diff_success(self):
        data = self.load("cover-recipes.json")
        data["recipes"].pop()
        self.write("cover-recipes.json", data)
        self.assertTrue(VERIFY.verify(self.root, self.skill)["errors"])

    def test_duplicate_identity_rejected(self):
        data = self.load("cover-recipes.json")
        data["recipes"].append(data["recipes"][0])
        self.write("cover-recipes.json", data)
        with self.assertRaisesRegex(ValueError, "duplicate id"):
            VERIFY.verify(self.root, self.skill)

    def test_wrong_manifest_public_id(self):
        data = self.load("cover-final44-manifest.json")
        data["covers"][0]["cloudinary_public_id"] += "-wrong"
        self.write("cover-final44-manifest.json", data)
        self.assertTrue(VERIFY.verify(self.root, self.skill)["errors"])

    def test_same_count_wrong_manifest_identity(self):
        data = self.load("cover-final44-manifest.json")
        data["covers"][0]["postId"] = 999
        self.write("cover-final44-manifest.json", data)
        self.assertTrue(VERIFY.verify(self.root, self.skill)["errors"])

    def test_recipe_dial_drift(self):
        data = self.load("cover-recipes.json")
        data["recipes"][0]["dials"]["style"] = "wrong"
        self.write("cover-recipes.json", data)
        self.assertTrue(VERIFY.verify(self.root, self.skill)["errors"])

    def test_whitespace_difference_is_not_normalized(self):
        render = self.skill.render_midjourney
        self.skill.render_midjourney = lambda *args, **kwargs: render(*args, **kwargs) + " "
        self.assertTrue(VERIFY.verify(self.root, self.skill)["diff"])


if __name__ == "__main__":
    unittest.main()
