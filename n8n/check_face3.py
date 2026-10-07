import re, json, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open('AbsensiBot V.5.1 1.json', 'r', encoding='utf-8') as f:
    raw = f.read()

# Find HTTP request nodes that might send face data
# Look for URL patterns related to face recognition
for pat in ['face', 'recogni', 'verify', 'histogram', 'similarity']:
    for m in re.finditer(pat, raw, re.IGNORECASE):
        start = max(0, m.start() - 200)
        end = min(len(raw), m.end() + 200)
        ctx = raw[start:end].replace('\\n', '\n')
        if 'http' in ctx.lower() or 'url' in ctx.lower() or 'request' in ctx.lower():
            print(f"--- {pat} at pos {m.start()} ---")
            print(ctx[:400])
            print()
            break
