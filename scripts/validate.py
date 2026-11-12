#!/usr/bin/env python3
"""Validate community contributions to team-skills. Exit code 1 if anything blocks merging.

Checks (plugins/<name>/skills/<name>/):
  - SKILL.md exists, has front matter with `name` (equal to the folder name), `description` and `author`
  - no executables / installers, no oversized files
  - no obvious secrets (tokens, private keys)
  - every .json file parses
Warnings (do not fail): personal absolute paths such as C:\\Users\\...
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGINS = os.path.join(ROOT, "plugins")

MAX_FILE_BYTES = 5 * 1024 * 1024
BAD_EXT = {".exe", ".dll", ".msi", ".bat", ".cmd", ".com", ".scr", ".so", ".dylib", ".apk", ".jar"}
SECRET_PATTERNS = [
    (r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----", "private key"),
    (r"\bghp_[A-Za-z0-9]{30,}\b", "GitHub token"),
    (r"\bgithub_pat_[A-Za-z0-9_]{30,}\b", "GitHub token"),
    (r"\bsk-[A-Za-z0-9_\-]{32,}\b", "API key (sk-...)"),
    (r"\bAKIA[0-9A-Z]{16}\b", "AWS access key"),
    (r"\bAIza[0-9A-Za-z_\-]{35}\b", "Google API key"),
    (r"\bxox[abprs]-[A-Za-z0-9\-]{10,}\b", "Slack token"),
    (r"(?i)\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['\"][^'\"\s]{12,}['\"]", "hard-coded credential"),
]
TEXT_EXT = {".md", ".txt", ".json", ".py", ".ps1", ".sh", ".js", ".ts", ".toml", ".yml", ".yaml", ".cfg", ".ini", ".csv", ".xml", ".html"}

errors, warnings = [], []


def err(msg):
    errors.append(msg)
    print("::error::" + msg)


def warn(msg):
    warnings.append(msg)
    print("::warning::" + msg)


def front_matter(text):
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    if not m:
        return None
    out = {}
    for line in m.group(1).splitlines():
        kv = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
        if kv:
            out[kv.group(1)] = kv.group(2).strip().strip("'\"")
    return out


def check_plugin(name):
    base = os.path.join(PLUGINS, name)
    skill_dir = os.path.join(base, "skills", name)
    skill_md = os.path.join(skill_dir, "SKILL.md")
    rel = f"plugins/{name}"
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_\-]{1,63}$", name):
        err(f"{rel}: folder name must be 2-64 chars of letters, digits, '-' or '_'")
    if not os.path.isdir(skill_dir):
        err(f"{rel}: expected folder skills/{name}/ inside the plugin (found other layout)")
        return
    if not os.path.isfile(skill_md):
        err(f"{rel}/skills/{name}/SKILL.md is missing")
        return
    with open(skill_md, encoding="utf-8", errors="replace") as f:
        fm = front_matter(f.read())
    if fm is None:
        err(f"{rel}: SKILL.md must start with a front matter block (--- name/description ---)")
    else:
        if not fm.get("description"):
            err(f"{rel}: SKILL.md front matter needs a non-empty 'description'")
        if not fm.get("author"):
            err(f"{rel}: SKILL.md front matter needs 'author:' (your name) so everyone knows whose skill this is")
        if fm.get("name") != name:
            err(f"{rel}: front matter name '{fm.get('name')}' must equal the folder name '{name}'")

    for dp, dn, fn in os.walk(base):
        dn[:] = [d for d in dn if d not in (".git", "__pycache__", "node_modules")]
        for f in fn:
            full = os.path.join(dp, f)
            r = os.path.relpath(full, ROOT).replace(os.sep, "/")
            ext = os.path.splitext(f)[1].lower()
            size = os.path.getsize(full)
            if ext in BAD_EXT:
                err(f"{r}: executable/installer files are not allowed")
            if size > MAX_FILE_BYTES:
                err(f"{r}: {size / 1e6:.1f} MB is over the {MAX_FILE_BYTES // 1024 // 1024} MB limit")
            if ext == ".json":
                try:
                    with open(full, encoding="utf-8") as fh:
                        json.load(fh)
                except Exception as e:  # noqa: BLE001
                    err(f"{r}: invalid JSON ({e})")
            if ext in TEXT_EXT and size <= MAX_FILE_BYTES:
                with open(full, encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
                for pat, label in SECRET_PATTERNS:
                    if re.search(pat, text):
                        err(f"{r}: looks like it contains a {label}. Remove it before merging")
                if re.search(r"[A-Za-z]:\\Users\\[^\\\s]+\\", text):
                    warn(f"{r}: contains a personal absolute path (C:\\Users\\...). Prefer a relative or generic path")


def main():
    if not os.path.isdir(PLUGINS):
        err("plugins/ folder not found")
    else:
        for name in sorted(os.listdir(PLUGINS)):
            if os.path.isdir(os.path.join(PLUGINS, name)):
                check_plugin(name)
    print(f"\nvalidate: {len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
