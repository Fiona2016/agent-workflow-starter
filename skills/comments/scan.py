#!/usr/bin/env python3
"""列出 tandem-comments 中等待某个 agent 处理的批注线程。

用法: scan.py [路径] [--agent 名字] [--all]
  路径          文件或文件夹（默认 ~/workspace/vault）
  --agent 名字  查谁的队列（默认取 $COMMENTS_AGENT，再默认 "claude"）
  --all         列出所有 agent 的待办，每条带 `agent` 字段

判定：状态 open + 用户最后那条消息 @ 了该 agent + 该 agent 在那之后没说过话。
@ai / @agent 表示先到先得。

只读。写回是 agent 的活，见 SKILL.md。
"""
import json, os, re, sys, pathlib

FENCE = "```tandem-comments"

# 属于 agent 的署名（其余视为用户本人），用来定位最后一条人写的消息。
BOTS = {"claude", "codex", "kimi", "cursor", "gemini", "gpt", "opencode"}
ANY = {"ai", "agent"}


def parse(path):
    try:
        raw = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None, None
    m = re.search(r"\n?" + re.escape(FENCE) + r"\n", raw)
    if not m:
        return None, None
    prose = raw[: m.start()]
    rest = raw[m.end() :]
    if "```" not in rest:
        return None, None
    body = rest[: rest.rindex("```")]
    txt = "\n".join(l for l in body.split("\n") if not l.strip().startswith("//"))
    try:
        return prose, json.loads(txt)
    except json.JSONDecodeError:
        print(f"warn: unparseable block in {path}", file=sys.stderr)
        return None, None


def mentions(text):
    """取出一条消息里 @ 到的 agent 名（小写）。"""
    return {h.lower() for h in re.findall(r"@([A-Za-z][A-Za-z0-9_-]*)", text or "")}


def addressed_to(entry, agent):
    """这条线程是否在等 `agent`？是则返回它被点名时用的 handle。"""
    if entry.get("status") != "open":
        return None
    thread = entry.get("thread") or []
    # 最后一条由人写的消息
    last_human = None
    for i, m in enumerate(thread):
        if (m.get("author") or "").strip().lower() not in BOTS:
            last_human = i
    if last_human is None:
        return None
    asked = mentions(thread[last_human].get("text"))
    hit = ({agent} & asked) or (ANY & asked)
    if not hit:
        return None
    # 该 agent 在那之后说过话了吗
    for m in thread[last_human + 1 :]:
        if (m.get("author") or "").strip().lower() == agent:
            return None
    return sorted(hit)[0]


def main():
    argv = sys.argv[1:]
    show_all = "--all" in argv
    argv = [a for a in argv if a != "--all"]
    agent = os.environ.get("COMMENTS_AGENT", "claude").lower()
    if "--agent" in argv:
        i = argv.index("--agent")
        agent = argv[i + 1].lower()
        del argv[i : i + 2]
    agents = sorted(BOTS) if show_all else [agent]
    root = pathlib.Path(argv[0] if argv else "~/workspace/vault").expanduser()
    out = []
    files = [root] if root.is_file() else root.rglob("*.md")
    for f in files:
        if any(p in {".git", ".obsidian", ".trash"} for p in f.parts):
            continue
        prose, data = parse(f)
        if not data:
            continue
        for cid, e in data.items():
            hits = [(a, addressed_to(e, a)) for a in agents]
            hits = [(a, h) for a, h in hits if h]
            if not hits:
                continue
            who, handle = hits[0]
            last = e["thread"][-1]
            quote = (e.get("anchor") or {}).get("exact", "")
            out.append({
                "file": str(f),
                "id": cid,
                "agent": who,
                "addressed_by": "@" + handle,
                "quote": quote[:60] + ("…" if len(quote) > 60 else ""),
                "last_author": last.get("author"),
                "last_text": last.get("text"),
                "has_suggestion": "suggestion" in e,
                "ts": last.get("ts"),
            })
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
