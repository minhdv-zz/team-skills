#!/usr/bin/env python3
"""Keep the generated listings in step with the repository contents.

  - plugins/<n>/.claude-plugin/plugin.json   created when missing
  - .claude-plugin/marketplace.json          one entry per plugin folder
  - docs/skills.json                         adds missing skills (existing hand-written entries are kept)
  - docs/addons.json                         adds addons found in the addons repo (pass --addons <dir>)

Entries written by hand are never overwritten, only missing ones are added and entries whose
folder was deleted are removed (link/zip entries for external downloads are always kept).
"""
import argparse
import ast
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGINS = os.path.join(ROOT, "plugins")


def load(path, default):
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def front_matter(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    out = {}
    if m:
        for line in m.group(1).splitlines():
            kv = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
            if kv:
                out[kv.group(1)] = kv.group(2).strip().strip("'\"")
    return out


def clip(s, n):
    s = " ".join(s.split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def pretty(name):
    return re.sub(r"[_\-]+", " ", name).strip().title()


def sync_skills():
    names = sorted(d for d in os.listdir(PLUGINS) if os.path.isdir(os.path.join(PLUGINS, d)))
    meta = {}
    for n in names:
        md = os.path.join(PLUGINS, n, "skills", n, "SKILL.md")
        if os.path.isfile(md):
            meta[n] = front_matter(md)
    changed = False

    # plugin.json per plugin
    for n, fm in meta.items():
        pj = os.path.join(PLUGINS, n, ".claude-plugin", "plugin.json")
        if not os.path.isfile(pj):
            save(pj, {
                "name": n.replace("_", "-"),
                "description": clip(fm.get("description", ""), 200),
                "version": "1.0.0",
                "author": {"name": fm.get("author") or "team-skills contributors"},
            })
            print("created", os.path.relpath(pj, ROOT))
            changed = True

    # marketplace.json
    mp_path = os.path.join(ROOT, ".claude-plugin", "marketplace.json")
    mp = load(mp_path, {"name": "team-skills-marketplace", "owner": {"name": "hoidz"}, "plugins": []})
    by_src = {p.get("source"): p for p in mp.get("plugins", [])}
    new_list = []
    for n in meta:
        src = f"./plugins/{n}"
        entry = by_src.get(src) or {
            "name": n.replace("_", "-"),
            "source": src,
            "description": clip(meta[n].get("description", ""), 200),
        }
        new_list.append(entry)
    if new_list != mp.get("plugins"):
        mp["plugins"] = new_list
        save(mp_path, mp)
        print("updated marketplace.json")
        changed = True

    # docs/skills.json
    sk_path = os.path.join(ROOT, "docs", "skills.json")
    skills = load(sk_path, [])
    have = {s["name"] for s in skills}
    out = [s for s in skills if s["name"] in meta]
    # keep `version` in step with SKILL.md (only when the skill declares one)
    for s in out:
        v = meta[s["name"]].get("version")
        if v and s.get("version") != v:
            s["version"] = v
    for n, fm in meta.items():
        if n not in have:
            entry = {
                "name": n,
                "title": pretty(fm.get("name") or n),
                "desc": clip(fm.get("description", ""), 200),
                "needs": [],
                "author": fm.get("author", ""),
            }
            if fm.get("version"):
                entry["version"] = fm["version"]
            if os.path.isfile(os.path.join(ROOT, "docs", "img", n + ".jpg")):
                entry["img"] = f"img/{n}.jpg"
            out.append(entry)
            print("added skill", n)
    if out != skills:
        save(sk_path, out)
        changed = True
    return changed


def read_bl_info(init_py):
    try:
        with open(init_py, encoding="utf-8", errors="replace") as f:
            tree = ast.parse(f.read())
    except Exception:  # noqa: BLE001
        return {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "bl_info" for t in node.targets):
            try:
                return ast.literal_eval(node.value)
            except Exception:  # noqa: BLE001
                return {}
    return {}


def author_of(path, info):
    a = str(info.get("author") or "").strip()
    if not a:
        mf = os.path.join(path, "blender_manifest.toml")
        if os.path.isfile(mf):
            with open(mf, encoding="utf-8", errors="replace") as f:
                m = re.search(r'(?m)^maintainer\s*=\s*"([^"]+)"', f.read())
            if m:
                a = re.sub(r"\s*<[^>]*>", "", m.group(1)).strip()
    return a


def sync_addons(addons_dir):
    if not addons_dir or not os.path.isdir(addons_dir):
        return False
    found = {}
    for d in sorted(os.listdir(addons_dir)):
        p = os.path.join(addons_dir, d)
        if os.path.isdir(p) and (os.path.isfile(os.path.join(p, "__init__.py")) or os.path.isfile(os.path.join(p, "blender_manifest.toml"))):
            found[d] = read_bl_info(os.path.join(p, "__init__.py"))
    path = os.path.join(ROOT, "docs", "addons.json")
    addons = load(path, [])
    have = {a["name"] for a in addons}
    out = []
    for a in addons:
        external = bool(a.get("link") or a.get("zip"))
        if external or a["name"] in found:
            out.append(a)
        else:
            print("removed addon", a["name"])
    for d, info in found.items():
        if d in have:
            continue
        ver = info.get("blender")
        needs = ["Blender " + ".".join(str(x) for x in ver[:2]) + "+"] if isinstance(ver, (tuple, list)) and ver else ["Blender"]
        out.append({
            "name": d,
            "title": str(info.get("name") or pretty(d)),
            "desc": clip(str(info.get("description") or "Addon Blender do cộng đồng đóng góp."), 200),
            "license": "",
            "needs": needs,
            "author": author_of(os.path.join(addons_dir, d), info),
        })
        print("added addon", d)
    if out != addons:
        save(path, out)
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addons", help="path to the addons/ folder of the team-blender-addons repo")
    args = ap.parse_args()
    changed = sync_skills()
    changed = sync_addons(args.addons) or changed
    print("sync: changes written" if changed else "sync: nothing to do")
    return 0


if __name__ == "__main__":
    sys.exit(main())
