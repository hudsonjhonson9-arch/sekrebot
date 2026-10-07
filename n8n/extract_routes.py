import re, os

with open('AbsensiBot V.5.1 1.json', 'r', encoding='utf-8') as f:
    raw = f.read()

paths = re.findall(r'"path":\s*"([^"]+)"', raw)
unique = sorted(set(paths))
print(f'Total webhook nodes: {len(paths)}')
print(f'Unique paths ({len(unique)}):')
for p in unique:
    print(f'  /webhook/{p}')
