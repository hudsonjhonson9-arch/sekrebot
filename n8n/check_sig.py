import re, json, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open('AbsensiBot V.5.1 1.json', 'r', encoding='utf-8') as f:
    raw = f.read()

# Find signature-save related queries
for pat in ['tanda_tangan', 'signature.*INSERT', 'signature.*UPDATE']:
    for m in re.finditer(pat, raw, re.IGNORECASE):
        start = max(0, m.start() - 200)
        end = min(len(raw), m.end() + 400)
        ctx = raw[start:end].replace('\\n', '\n').replace('\\t', ' ')
        print(f"=== {pat} at {m.start()} ===")
        print(ctx[:600])
        print()
