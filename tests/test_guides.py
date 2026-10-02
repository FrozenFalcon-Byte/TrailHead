from pathlib import Path

from trailhead.retrieve import guide_evidence, text_evidence


class _Meta:
    def get_meta(self, key):
        return "owner/repo" if key == "repo" else "abc"


def test_guides_start_at_the_running_tests_section(tmp_path: Path):
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "contributing.rst").write_text("Intro\n=====\n\n" + "filler words. " * 200 + "\n\nRunning tests\n-------------\n\nTo run all tests::\n\n    tox\n")
    (tmp_path / "README.md").write_text("# Project\n\nNothing about checks here.\n")
    found = guide_evidence(_Meta(), tmp_path)
    assert found and found[0].title == "docs/contributing.rst"
    assert found[0].text.startswith("Running tests") and "tox" in found[0].text
    assert all(e.title != "README.md" for e in found)


def test_text_evidence_stays_inside_the_repository(tmp_path: Path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (tmp_path / "secret.txt").write_text("outside")
    assert text_evidence(_Meta(), repo, "../secret.txt") == []
