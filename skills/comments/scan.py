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
SKIP_DIRS = {".git", ".obsidian", ".trash", "node_modules"}

# 属于 agent 的署名（其余一律视为用户本人），用来定位最后一条人写的消息。
# 这里列得比本仓库支持的三家宽：只要某个 agent 可能在线程里留言，就必须认得它，
# 否则它的回复会被当成"用户又说话了"，线程永远停在待办。
BOTS = {"claude", "codex", "kimi", "cursor", "gemini", "gpt", "opencode"}
ANY = {"ai", "agent"}

# @提及：左边必须是行首或非标识符字符，否则 "foo@claude.ai" 这类邮箱会被误判。
MENTION = re.compile(r"(?<![A-Za-z0-9_.+-])@([A-Za-z][A-Za-z0-9_-]*)")


def parse(path):
    """返回批注块里的 dict；文件无块、无法解码或结构不对时返回 None。"""
    try:
        raw = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None
    m = re.search(r"\n?" + re.escape(FENCE) + r"\n", raw)
    if not m:
        return None
    rest = raw[m.end():]
    if "```" not in rest:
        return None
    body = rest[: rest.rindex("```")]
    txt = "\n".join(l for l in body.split("\n") if not l.strip().startswith("//"))
    try:
        data = json.loads(txt)
    except json.JSONDecodeError:
        print(f"warn: {path} 的批注块不是合法 JSON，已跳过", file=sys.stderr)
        return None
    if not isinstance(data, dict):
        print(f"warn: {path} 的批注块顶层不是对象，已跳过", file=sys.stderr)
        return None
    return data


def mentions(text):
    """取出一条消息里 @ 到的 agent 名（小写）。"""
    return {h.lower() for h in MENTION.findall(text or "")}


def addressed_to(entry, agent):
    """这条线程是否在等 `agent`？是则返回它被点名时用的 handle，否则 None。"""
    if not isinstance(entry, dict) or entry.get("status") != "open":
        return None
    thread = entry.get("thread")
    if not isinstance(thread, list):
        return None
    msgs = [m for m in thread if isinstance(m, dict)]
    # 最后一条由人写的消息
    last_human = None
    for i, m in enumerate(msgs):
        if (m.get("author") or "").strip().lower() not in BOTS:
            last_human = i
    if last_human is None:
        return None
    asked = mentions(msgs[last_human].get("text"))
    hit = ({agent} & asked) or (ANY & asked)
    if not hit:
        return None
    # 该 agent 在那之后说过话了吗
    for m in msgs[last_human + 1:]:
        if (m.get("author") or "").strip().lower() == agent:
            return None
    return sorted(hit)[0]


def iter_md(root):
    """遍历 .md，跳过 .git / .obsidian 等目录——剪枝，不是先走完再过滤。"""
    if root.is_file():
        yield root
        return
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            if fn.endswith(".md"):
                yield pathlib.Path(dirpath) / fn


def parse_args(argv):
    show_all = "--all" in argv
    argv = [a for a in argv if a != "--all"]
    agent = os.environ.get("COMMENTS_AGENT", "claude").lower()
    if "--agent" in argv:
        i = argv.index("--agent")
        if i + 1 >= len(argv):
            sys.exit("错误：--agent 后面要跟 agent 名字，例如 --agent codex")
        agent = argv[i + 1].lower()
        del argv[i:i + 2]
    root = pathlib.Path(argv[0] if argv else "~/workspace/vault").expanduser()
    return root, (sorted(BOTS) if show_all else [agent])


def main():
    root, agents = parse_args(sys.argv[1:])
    out = []
    for f in iter_md(root):
        try:
            data = parse(f)
        except Exception as exc:                      # 单个文件出问题不许拖垮整次扫描
            print(f"warn: 读取 {f} 失败（{exc}），已跳过", file=sys.stderr)
            continue
        if not data:
            continue
        for cid, e in data.items():
            for who in agents:                        # 同时 @ 了多个 agent 时每个都要出现
                handle = addressed_to(e, who)
                if not handle:
                    continue
                last = [m for m in e["thread"] if isinstance(m, dict)][-1]
                quote = (e.get("anchor") or {}).get("exact", "") if isinstance(e.get("anchor"), dict) else ""
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
