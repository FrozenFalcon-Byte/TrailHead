"""Outbound guard: secret-looking strings never leave this machine.

Ingest already skips secret files by name (ingest/files.py). This catches what hides inside ordinary files, commit
messages and issue text: every payload is redacted right before it is sent to Jev or an LLM. Cache keys are computed
from the unredacted state, so redaction never changes which cached answer a call replays.
"""

from __future__ import annotations

import re
from typing import Any

# Each pattern matches a credential with a recognisable shape. The generic assignment pattern needs a long,
# quoted value so that `password = request.password` style code is left alone.
_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("private_key", re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?(-----END [A-Z0-9 ]*PRIVATE KEY-----|\Z)", re.DOTALL)),
    ("aws_access_key", re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("github_token", re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b")),
    ("slack_token", re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}\b")),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("openai_style_key", re.compile(r"\b(sk|gsk|sk-ant|sk-proj)[-_][A-Za-z0-9_-]{20,}\b")),
    ("stripe_key", re.compile(r"\b[rs]k_(live|test)_[A-Za-z0-9]{16,}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("url_credentials", re.compile(r"(?<=://)[^/\s:@]{1,64}:[^/\s@]{6,}(?=@)")),
    (
        "assigned_secret",
        re.compile(r"""(?i)\b((?:api|access|auth|secret|private)[_-]?(?:key|token|secret)|password|passwd|client[_-]?secret)\b(\s*[:=]\s*)(["'])([^"'\s]{12,})\3"""),
    ),
)


def redact(text: str) -> tuple[str, list[str]]:
    """Text with every secret-looking span replaced, and the kinds that were found."""
    found: list[str] = []
    for kind, pattern in _PATTERNS:
        def swap(m: re.Match[str], kind: str = kind) -> str:
            found.append(kind)
            if kind == "assigned_secret":
                return f"{m.group(1)}{m.group(2)}{m.group(3)}[REDACTED:{kind}]{m.group(3)}"
            return f"[REDACTED:{kind}]"

        text = pattern.sub(swap, text)
    return text, found


def redact_payload(value: Any) -> Any:
    """Redacts every string inside a JSON-like structure, keys included."""
    if isinstance(value, str):
        return redact(value)[0]
    if isinstance(value, dict):
        return {redact_payload(k): redact_payload(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_payload(v) for v in value]
    return value
