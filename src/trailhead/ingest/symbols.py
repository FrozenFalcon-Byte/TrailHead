"""Symbol, docstring and import extraction. Python uses tree-sitter; other files get a header only."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import tree_sitter_python
from tree_sitter import Language, Node, Parser

_PY = Parser(Language(tree_sitter_python.language()))
MAX_DOC = 300
MAX_HEADER = 600
MAX_SIGNATURE = 200


@dataclass(frozen=True)
class Symbol:
    name: str
    kind: str  # class | function | method
    signature: str
    doc: str
    start_line: int
    end_line: int


@dataclass(frozen=True)
class Import:
    module: str  # dotted, without leading dots
    level: int  # 0 for absolute, n for n leading dots
    names: tuple[str, ...]  # imported names for `from x import a, b`; empty for `import x`


@dataclass
class ModuleInfo:
    header: str = ""
    symbols: list[Symbol] = field(default_factory=list)
    imports: list[Import] = field(default_factory=list)


def _text(node: Node, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _squash(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def first_paragraph(text: str, limit: int = MAX_DOC) -> str:
    return _squash(re.split(r"\n\s*\n", text.strip(), maxsplit=1)[0], limit)


def _docstring(block: Node | None, source: bytes) -> str:
    if block is None:
        return ""
    for child in block.children:
        if child.type == "comment":
            continue
        if child.type == "expression_statement" and child.child_count and child.children[0].type == "string":
            content = "".join(_text(c, source) for c in child.children[0].children if c.type == "string_content")
            return first_paragraph(content)
        return ""
    return ""


def _signature(node: Node, source: bytes) -> str:
    body = node.child_by_field_name("body")
    end = body.start_byte if body else node.end_byte
    return _squash(source[node.start_byte : end].decode("utf-8", errors="replace").rstrip().rstrip(":"), MAX_SIGNATURE)


def _unwrap(node: Node) -> Node | None:
    if node.type == "decorated_definition":
        node = node.child_by_field_name("definition") or node
    return node if node.type in ("class_definition", "function_definition") else None


def _definitions(block: Node, source: bytes, prefix: str, out: list[Symbol]) -> None:
    for child in block.children:
        node = _unwrap(child)
        if node is None:
            continue
        name_node = node.child_by_field_name("name")
        if name_node is None:
            continue
        name = prefix + _text(name_node, source)
        body = node.child_by_field_name("body")
        is_class = node.type == "class_definition"
        kind = "class" if is_class else ("method" if prefix else "function")
        out.append(Symbol(name, kind, _signature(node, source), _docstring(body, source), child.start_point[0] + 1, child.end_point[0] + 1))
        if is_class and body is not None and not prefix:
            _definitions(body, source, name + ".", out)


def _imports(root: Node, source: bytes, out: list[Import]) -> None:
    stack = [root]
    while stack:
        node = stack.pop()
        if node.type == "import_statement":
            for child in node.named_children:
                target = child.child_by_field_name("name") if child.type == "aliased_import" else child
                if target is not None and target.type == "dotted_name":
                    out.append(Import(_text(target, source), 0, ()))
        elif node.type == "import_from_statement":
            module_node = node.child_by_field_name("module_name")
            if module_node is None:
                continue
            raw = _text(module_node, source)
            level = len(raw) - len(raw.lstrip("."))
            names: list[str] = []
            for child in node.named_children:
                if child == module_node:
                    continue
                target = child.child_by_field_name("name") if child.type == "aliased_import" else child
                if target is not None and target.type == "dotted_name":
                    names.append(_text(target, source))
            out.append(Import(raw.lstrip("."), level, tuple(names)))
        else:
            stack.extend(node.children)


def parse_python(text: str) -> ModuleInfo:
    source = text.encode("utf-8")
    root = _PY.parse(source).root_node
    info = ModuleInfo(header=_docstring(root, source) or _leading_comment(text))
    _definitions(root, source, "", info.symbols)
    _imports(root, source, info.imports)
    return info


_NOISE_COMMENT = re.compile(r"^\s*(pragma|pylint|noqa|type:|mypy:|ruff:|flake8|isort|fmt:|coding[:=]|-\*-|SPDX|copyright|\(c\))", re.IGNORECASE)


def _leading_comment(text: str) -> str:
    lines: list[str] = []
    for line in text.splitlines()[:40]:
        stripped = line.strip()
        if stripped.startswith("#!") or not stripped:
            if lines:
                break
            continue
        match = re.match(r"^(#|//|--|\*|/\*+)\s?(.*)$", stripped)
        if not match:
            break
        if not _NOISE_COMMENT.search(match.group(2)):
            lines.append(match.group(2))
    return _squash(" ".join(lines), MAX_DOC)


def parse_generic(text: str, lang: str) -> ModuleInfo:
    if lang in ("markdown", "rst"):
        for line in text.splitlines()[:30]:
            stripped = line.strip().lstrip("#").strip()
            if stripped and not re.fullmatch(r"[=\-~`^\"'*+#.:_]{3,}", stripped) and not stripped.startswith(("..", "|", ":", "[!", "<", "![")):
                return ModuleInfo(header=_squash(stripped, MAX_DOC))
        return ModuleInfo()
    return ModuleInfo(header=_leading_comment(text))


def parse_file(text: str, lang: str) -> ModuleInfo:
    info = parse_python(text) if lang == "python" else parse_generic(text, lang)
    info.header = info.header[:MAX_HEADER]
    return info


def resolve_import(imp: Import, src_path: str, known: set[str]) -> list[str]:
    """Map one import to repository files, trying the usual package layouts. Returns [] for third-party imports."""
    if imp.level:
        base = src_path.split("/")[:-1]
        base = base[: len(base) - (imp.level - 1)] if imp.level > 1 else base
        roots = ["/".join(base)]
    else:
        roots = ["", "src", "lib"]
    module_path = imp.module.replace(".", "/")
    found: list[str] = []
    for root in roots:
        prefix = f"{root}/" if root else ""
        stem = f"{prefix}{module_path}".rstrip("/")
        for name in imp.names:
            for candidate in (f"{stem}/{name}.py", f"{stem}/{name}/__init__.py"):
                if candidate in known and candidate not in found:
                    found.append(candidate)
        if stem:
            for candidate in (f"{stem}.py", f"{stem}/__init__.py"):
                if candidate in known and candidate not in found:
                    found.append(candidate)
                    break
        if found:
            break
    return [path for path in found if path != src_path]
