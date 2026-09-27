#!/usr/bin/env python3
"""review_diff.py — diff EVERYTHING a review-mode import serves against HEAD, before it lands.

    npm run review:diff [-- <slug>]        (default slug: the-subjects-unanswered-plea)
    python3 scripts/review_diff.py <slug> [--lane <dir>]

Why: a sha gate is necessary, not sufficient. The 17th lane state passed every sha and
still emptied 59 context cells because a source file had gone missing upstream; the
version-4 signal named a state the worktree had already moved past. So after
`import-review-links.mjs` and before `git commit`, this prints what changed in
what the site serves — the review JSON (book, render, markers, works, sources,
units and their status / rights censuses, boxes), the served manifest, the version
log (and its byte identity with the lane's `_VERSIONS.json`), the works markdown,
and the uploads tree (added / modified / deleted files, and any file that went
empty or lost cells where HEAD's had them) — so every line can be traced to the
drafter's signal, and the import refused with the cells named when one cannot.

Read-only: it never writes to the tree. Exit status is 0 whether or not there are
differences; the reading is the gate, not the exit code."""
import json
import os
import subprocess
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(os.path.expanduser('~'), 'Git', 'work_station', 'research_library')
# mirrors REVIEWS in scripts/import-review-links.mjs: slug -> (served id, lane dir)
REVIEWS = {
    'the-subjects-unanswered-plea': ('immunity-book', os.path.join(LIB, '2_Academic Articles', '11_Immunity and Standing Doctrine Geneology', 'BOOK', 'Pinned Citation Extracts')),
    'a-restorative-reading-of-genesis-1-3': ('genesis-1-3', os.path.join(LIB, '2_Academic Articles', '14_Restorative Reading of Genesis 1-3', 'BOOK', 'Pinned Citation Extracts')),
    'the-holy-seed': ('holy-seed', os.path.join(LIB, '2_Academic Articles', '13_Fall of Babylon and Jewish Identity', 'BOOK', 'Pinned Citation Extracts')),
}


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    slug = args[0] if args else 'the-subjects-unanswered-plea'
    lane = None
    if '--lane' in argv:
        lane = argv[argv.index('--lane') + 1]
    if slug not in REVIEWS:
        sys.exit(f'unknown slug {slug!r}; known: {", ".join(REVIEWS)}')
    served_id, lane_default = REVIEWS[slug]
    lane = lane or lane_default
    up = f'public/uploads/research/{served_id}'

    def git(*a):
        return subprocess.run(['git', *a], capture_output=True, cwd=ROOT).stdout

    def head_bytes(path):
        return git('show', f'HEAD:{path}')

    def load_head(path):
        b = head_bytes(path)
        return json.loads(b) if b else None

    def load_wc(path):
        p = os.path.join(ROOT, path)
        return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None

    def dict_diff(a, b, label, fields_ignore=()):
        a = a or {}
        b = b or {}
        added = sorted(set(b) - set(a))
        removed = sorted(set(a) - set(b))
        changed = {}
        fieldc = Counter()
        for k in set(a) & set(b):
            if a[k] == b[k]:
                continue
            if isinstance(a[k], dict) and isinstance(b[k], dict):
                fs = sorted(f for f in set(a[k]) | set(b[k]) if a[k].get(f) != b[k].get(f) and f not in fields_ignore)
                if not fs:
                    continue
                changed[k] = fs
                fieldc.update(fs)
            else:
                changed[k] = ['<value>']
                fieldc['<value>'] += 1
        print(f'== {label}: HEAD {len(a)} → now {len(b)}; added {len(added)}, removed {len(removed)}, changed {len(changed)}')
        for k in added[:40]:
            print(f'   + {k}')
        for k in removed[:40]:
            print(f'   - {k}')
        if changed:
            print(f'   changed fields: {dict(fieldc)}')
            for k, fs in list(changed.items())[:40]:
                print(f'   ~ {k}: {fs}')
        return added, removed, changed

    # ------------------------------------------------------------ review JSON
    rp = f'content/review/{slug}.json'
    A, B = load_head(rp), load_wc(rp)
    print(f'#### review JSON {rp}')
    if A is None or B is None:
        print(f'   HEAD: {"present" if A else "absent"}; working copy: {"present" if B else "absent"}')
    else:
        for k in ('feed', 'slug', 'id', 'rightsRule', 'publicUrl', 'publicBytes'):
            if A.get(k) != B.get(k):
                print(f'   {k}: {str(A.get(k))[:90]}  →  {str(B.get(k))[:90]}')
        for k in ('book', 'pdf'):
            fs = sorted(f for f in set(A.get(k, {})) | set(B.get(k, {})) if A.get(k, {}).get(f) != B.get(k, {}).get(f))
            print(f'   {k}: changed fields {fs}' if fs else f'   {k}: unchanged')
            for f in fs:
                print(f'      {f}: {str(A.get(k, {}).get(f))[:70]} → {str(B.get(k, {}).get(f))[:70]}')

        def mkey(m):
            r = m.get('rect')
            return (m.get('note'), m.get('page'), tuple(r) if isinstance(r, list) else str(r))
        ma = Counter(mkey(m) for m in A.get('markers', []))
        mb = Counter(mkey(m) for m in B.get('markers', []))
        print(f'   markers: HEAD {sum(ma.values())} → now {sum(mb.values())}; added {sum((mb - ma).values())}, removed {sum((ma - mb).values())}')
        for m in list((mb - ma).elements())[:10]:
            print('      +', m[:2])
        for m in list((ma - mb).elements())[:10]:
            print('      -', m[:2])
        dict_diff(A.get('works'), B.get('works'), 'works')
        dict_diff(A.get('sources'), B.get('sources'), 'sources')
        ua = {u['id']: u for u in A.get('units', [])}
        ub = {u['id']: u for u in B.get('units', [])}
        add, rem, chg = dict_diff(ua, ub, 'units')
        for k in add:
            u = ub[k]
            print(f'      + {k}: note={u.get("note")} status={u.get("status")} rights={u.get("rights")} source={u.get("source")} work={u.get("work")} pages={u.get("pages")}')
        for k in list(chg)[:40]:
            print(f'      ~ {k}: ' + '; '.join(f'{f}: {str(ua[k].get(f))[:60]} → {str(ub[k].get(f))[:60]}' for f in chg[k]))
        for name in ('status', 'rights'):
            ca = Counter(u.get(name) for u in A.get('units', []))
            cb = Counter(u.get(name) for u in B.get('units', []))
            print(f'   {name} census: HEAD {dict(ca)}\n   {" " * len(name)}         now  {dict(cb)}')
        box_a = sum(1 for u in A.get('units', []) if u.get('box'))
        box_b = sum(1 for u in B.get('units', []) if u.get('box'))
        print(f'   boxed units: HEAD {box_a} → now {box_b}')

    # ------------------------------------------------------------ served manifest
    sp = f'{up}/_SERVED.json'
    SA, SB = load_head(sp), load_wc(sp)
    print(f'\n#### served manifest {sp}')
    if isinstance(SA, dict) and isinstance(SB, dict):
        same = True
        for k in sorted(set(SA) | set(SB)):
            va, vb = SA.get(k), SB.get(k)
            if va == vb:
                continue
            same = False
            if isinstance(va, dict) and isinstance(vb, dict):
                dict_diff(va, vb, f'served.{k}')
            elif isinstance(va, list) and isinstance(vb, list):
                sa = Counter(json.dumps(x, sort_keys=True) for x in va)
                sb = Counter(json.dumps(x, sort_keys=True) for x in vb)
                print(f'== served.{k}: HEAD {len(va)} → now {len(vb)}; added {sum((sb - sa).values())}, removed {sum((sa - sb).values())}')
                for x in list((sb - sa).elements())[:20]:
                    print('   +', x[:160])
                for x in list((sa - sb).elements())[:20]:
                    print('   -', x[:160])
            else:
                print(f'   {k}: {str(va)[:90]} → {str(vb)[:90]}')
        if same:
            print('   unchanged')
    else:
        print(f'   HEAD: {type(SA).__name__}; working copy: {type(SB).__name__}')

    # ------------------------------------------------------------ version log
    vp = f'content/versions/{slug}.json'
    VA, VB = load_head(vp), load_wc(vp)
    print(f'\n#### version log {vp}')
    la = [v['version'] for v in (VA or {}).get('versions', [])]
    lb = [v['version'] for v in (VB or {}).get('versions', [])]
    print(f'   HEAD {la}\n   now  {lb}')
    for v in (VB or {}).get('versions', []):
        if v['version'] not in la:
            print(f'   + v{v["version"]} {v.get("date")} text {str(v.get("text"))[:12]} pdf {str(v.get("pdf"))[:12]} {v.get("lane_state")} commit {str(v.get("book_commit"))[:8]}')
            print('     note:', str(v.get('note'))[:600])
    lane_log = os.path.join(lane, '_VERSIONS.json')
    wc_log = os.path.join(ROOT, vp)
    if os.path.exists(lane_log) and os.path.exists(wc_log):
        print(f'   byte-identical to the lane\'s _VERSIONS.json: {open(lane_log, "rb").read() == open(wc_log, "rb").read()}')
    else:
        print(f'   lane log {"present" if os.path.exists(lane_log) else "ABSENT"}; site log {"present" if os.path.exists(wc_log) else "absent"}')

    # ------------------------------------------------------------ works markdown + uploads tree
    print('\n#### works markdown')
    print(git('diff', '--stat', '--', f'content/works/{slug}.md', 'content/works.json').decode() or '   unchanged')
    print(f'#### uploads tree {up}')
    st = git('status', '--porcelain', '--', up).decode().splitlines()
    c = Counter()
    entries = []
    for line in st:
        code, path = line[:2].strip(), line[3:].strip().strip('"')
        top = path[len(up) + 1:].split('/')[0]
        c[(code, top)] += 1
        entries.append((code, path))
    for (code, top), n in sorted(c.items()):
        print(f'   {code} {top}: {n}')
    if not st:
        print('   unchanged')
    for code, path in entries:
        if code in ('A', '??', 'D'):
            print(f'   {code} {path[len(up) + 1:]}')

    def nonempty(o):
        if isinstance(o, dict):
            return sum(1 for v in o.values() if v not in (None, '', [], {}))
        if isinstance(o, list):
            return len(o)
        return 1
    empties = []
    ctx_mods = []
    for code, path in entries:
        if code != 'M':
            continue
        full = os.path.join(ROOT, path)
        if os.path.getsize(full) == 0 and len(head_bytes(path)) > 0:
            empties.append(path)
            continue
        if path.endswith('.json'):
            try:
                hb, wb = json.loads(head_bytes(path)), json.load(open(full, encoding='utf-8'))
                if nonempty(wb) < nonempty(hb):
                    empties.append(f'{path} (non-empty cells {nonempty(hb)} → {nonempty(wb)})')
                if '/context/' in path and isinstance(hb, dict) and isinstance(wb, dict):
                    ctx_mods.append((path, sorted(f for f in set(hb) | set(wb) if hb.get(f) != wb.get(f))))
            except Exception as e:  # noqa: BLE001 — a file the diff cannot read is itself a finding
                empties.append(f'{path} (unreadable: {e})')
    print(f'   files that went empty or lost cells: {len(empties)}')
    for e in empties[:40]:
        print('      !', e)
    print(f'   modified under context/: {len(ctx_mods)}')
    for p, fs in ctx_mods[:20]:
        print(f'      ~ {p[len(up) + 1:]}: {fs[:10]}')


if __name__ == '__main__':
    main(sys.argv[1:])
