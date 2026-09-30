"""Which repository files Trailhead reads. Nothing here executes repository code."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

MAX_FILE_BYTES = 400_000

LANG_BY_EXT = {
    ".py": "python", ".pyi": "python", ".js": "javascript", ".jsx": "javascript", ".ts": "typescript", ".tsx": "typescript",
    ".go": "go", ".rs": "rust", ".java": "java", ".rb": "ruby", ".c": "c", ".h": "c", ".cpp": "cpp", ".sh": "shell",
    ".md": "markdown", ".rst": "rst", ".txt": "text", ".toml": "config", ".cfg": "config", ".ini": "config",
    ".yaml": "config", ".yml": "config", ".json": "config", ".html": "html", ".css": "css",
}
DOC_LANGS = {"markdown", "rst"}

_BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".bmp", ".webp", ".svgz", ".pdf", ".zip", ".gz", ".bz2", ".xz", ".tar", ".tgz",
    ".7z", ".rar", ".whl", ".egg", ".so", ".dylib", ".dll", ".exe", ".bin", ".pyc", ".pyo", ".class", ".jar", ".woff",
    ".woff2", ".ttf", ".eot", ".otf", ".mp3", ".mp4", ".mov", ".avi", ".wav", ".db", ".sqlite", ".pickle", ".pkl", ".npy",
    ".parquet", ".lz4", ".zst", ".br",
}
_LOCKFILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "pipfile.lock", "cargo.lock", "uv.lock",
    "composer.lock", "gemfile.lock", "go.sum", "pdm.lock",
}
_SKIP_DIRS = {
    "node_modules", "vendor", "vendored", "_vendor", "third_party", "thirdparty", "dist", "build", "__pycache__",
    "site-packages", ".tox", ".venv", "venv", ".git", ".idea", ".vscode", "htmlcov", ".eggs",
}
_SECRET_NAME = re.compile(
    r"(^\.env($|\.))|(^\.(netrc|npmrc|pypirc|htpasswd)$)|(^id_(rsa|dsa|ecdsa|ed25519))"
    r"|((^|[._-])(secret|secrets|credential|credentials|passwd|password|passwords|private[._-]?key)([._-]|$))",
    re.IGNORECASE,
)
_SECRET_EXT = {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".crt", ".cer", ".der", ".asc", ".gpg"}
_GENERATED_NAME = re.compile(r"(\.min\.(js|css)$)|(\.map$)|(_pb2(_grpc)?\.py$)|(\.generated\.)", re.IGNORECASE)
_TEST_PART = re.compile(r"^(tests?|testing|__tests__|spec|specs)$", re.IGNORECASE)
_TEST_FILE = re.compile(r"(^test_.*\.py$)|(_test\.(py|go)$)|(\.(test|spec)\.[jt]sx?$)|(^conftest\.py$)")


@dataclass(frozen=True)
class RepoFile:
    path: str
    lang: str
    size: int
    is_test: bool


def skip_reason(path: str) -> str | None:
    """Why a tracked path is excluded, or None to keep it. Secrets are excluded before anything reads them."""
    parts = path.split("/")
    name = parts[-1]
    suffix = Path(name).suffix.lower()
    if _SECRET_NAME.search(name) or suffix in _SECRET_EXT:
        return "secret"
    if any(part.lower() in _SKIP_DIRS for part in parts[:-1]):
        return "vendored_or_generated_dir"
    if name.lower() in _LOCKFILES:
        return "lockfile"
    if suffix in _BINARY_EXT:
        return "binary"
    if _GENERATED_NAME.search(name):
        return "generated"
    return None


def is_test_path(path: str) -> bool:
    parts = path.split("/")
    return any(_TEST_PART.match(p) for p in parts[:-1]) or bool(_TEST_FILE.search(parts[-1]))


def list_repo_files(repo_dir: Path) -> tuple[list[RepoFile], dict[str, int]]:
    """Tracked files only (so .gitignore is respected), minus everything skip_reason rejects."""
    out = subprocess.run(["git", "-C", str(repo_dir), "ls-files", "-z"], capture_output=True, check=True).stdout
    kept: list[RepoFile] = []
    skipped: dict[str, int] = {}
    for raw in out.split(b"\0"):
        if not raw:
            continue
        path = raw.decode("utf-8", errors="replace")
        reason = skip_reason(path)
        full = repo_dir / path
        if reason is None:
            if full.is_symlink() or not full.is_file():
                reason = "not_regular_file"
            else:
                size = full.stat().st_size
                if size > MAX_FILE_BYTES:
                    reason = "too_large"
                else:
                    with full.open("rb") as handle:
                        if b"\0" in handle.read(8192):
                            reason = "binary"
        if reason:
            skipped[reason] = skipped.get(reason, 0) + 1
            continue
        kept.append(RepoFile(path=path, lang=LANG_BY_EXT.get(Path(path).suffix.lower(), "other"), size=size, is_test=is_test_path(path)))
    return kept, skipped


def read_text(repo_dir: Path, path: str) -> str:
    return (repo_dir / path).read_text(encoding="utf-8", errors="replace")
