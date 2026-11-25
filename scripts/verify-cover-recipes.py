"""Check the historical cover inventory using the installed cover-recipes renderer.

No image generation or network access. The skill path is explicit so this repo
neither vendors nor silently reimplements the reusable renderer.
"""

import argparse
import difflib
import importlib.util
import json
from pathlib import Path


def keyed(rows, field):
    """Refuse duplicate identities before comparing the two inventories."""
    result = {row[field]: row for row in rows}
    if len(result) != len(rows):
        raise ValueError(f"duplicate {field}")
    return result


def verify(project, skill):
    """Return mismatch details; counts alone must not hide wrong identities."""
    history = json.loads((project / "docs/cover-history.json").read_text())["covers"]
    recipes = json.loads((project / "docs/cover-recipes.json").read_text())["recipes"]
    manifest = json.loads((project / "docs/cover-final44-manifest.json").read_text())["covers"]
    covers = keyed(history, "postId")
    captured = keyed(recipes, "id")
    rollout = keyed(manifest, "postId")
    errors = []
    if len(covers) != 53 or set(covers) != set(captured):
        errors.append("history/recipe identities must match all 53 published covers")
    expected44 = {c["postId"] for c in history if c["rollout"] == "2026-09-27 final 44"}
    if len(rollout) != 44 or set(rollout) != expected44:
        errors.append("manifest identities must match the final 44 rollout covers")
    settings = skill.extract_settings((project / "docs/CONTENT_IMAGERY.md").read_text())
    problems = skill.validate_settings(settings)
    if problems:
        raise ValueError(f"profile settings invalid: {problems}")
    diffs = []
    for post_id, recipe in captured.items():
        cover = covers.get(post_id)
        if cover is None:
            continue
        expected_dials = {"scene": cover["scene"], "style": cover["era"],
                          "family": cover["metaphorFamily"], "accent": cover["hue"],
                          "fieldOfUnits": cover["fieldOfUnits"]}
        if recipe["dials"] != expected_dials:
            errors.append(f"post {post_id}: recipe dials differ from history")
        for field in ("slug", "cloudinaryPublicId"):
            if recipe.get(field) != cover[field]:
                errors.append(f"post {post_id}: recipe {field} differs from history")
        if not all(isinstance(recipe.get(f), str) and recipe[f].strip()
                   for f in ("subject", "styleOverride")):
            errors.append(f"post {post_id}: incomplete historical recipe")
        # Render the actual structured slots, not a saved finalPrompt passthrough.
        rendered = skill.render_midjourney(recipe, settings, form="stored")
        if rendered != cover["finalPrompt"]:
            diffs.extend(difflib.unified_diff(
                [cover["finalPrompt"] + "\n"], [rendered + "\n"],
                fromfile=f"post-{post_id}-embedded", tofile=f"post-{post_id}-rendered"))
    for post_id, row in rollout.items():
        cover = covers.get(post_id)
        if cover is None:
            continue
        for source, target in (("slug", "slug"), ("cloudinary_public_id", "cloudinaryPublicId"),
                               ("alt", "alt")):
            if row[source] != cover[target]:
                errors.append(f"post {post_id}: manifest {source} differs from history")
    return {"history": len(history), "recipes": len(recipes), "manifest": len(manifest),
            "errors": errors, "diff": "".join(diffs)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-script", type=Path, required=True,
                        help="installed cover-recipes/scripts/cover_recipes.py")
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location("cover_recipes", args.skill_script)
    skill = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(skill)
    result = verify(Path(__file__).resolve().parents[1], skill)
    print(json.dumps(result, indent=2))
    return int(bool(result["errors"] or result["diff"]))


if __name__ == "__main__":
    raise SystemExit(main())
