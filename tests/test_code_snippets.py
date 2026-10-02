from trailhead.retrieve import code_snippets
from trailhead.store import Store


def test_snippets_show_the_definition_that_answers_the_question(tmp_path):
    repo = tmp_path / "repo"
    (repo / "pkg").mkdir(parents=True)
    (repo / "pkg" / "retry.py").write_text("import time\n\n\nclass Retry:\n    def backoff(self, n):\n        return 2 ** n\n\n    def other(self):\n        pass\n")
    store = Store(tmp_path / "t.db")
    store.set_meta("repo", "acme/widget")
    store.set_meta("head", "abc123")
    store.execute("INSERT INTO files (path, lang, loc, size, is_test, header, summary) VALUES ('pkg/retry.py', 'python', 9, 100, 0, '', '')")
    store.executemany(
        "INSERT INTO symbols (path, name, kind, signature, doc, start_line, end_line) VALUES (?,?,?,?,?,?,?)",
        [("pkg/retry.py", "Retry.backoff", "method", "def backoff(self, n)", "", 5, 6), ("pkg/retry.py", "Retry.other", "method", "def other(self)", "", 8, 9)],
    )
    [snip] = code_snippets(store, repo, ["pkg/retry.py", "pkg/missing.py"], {}, "How long is the backoff between retries?")
    assert (snip["symbol"], snip["start"], snip["end"]) == ("Retry.backoff", 5, 6)
    assert snip["code"] == "def backoff(self, n):\n    return 2 ** n"
    assert snip["url"].endswith("/acme/widget/blob/abc123/pkg/retry.py#L5-L6")
