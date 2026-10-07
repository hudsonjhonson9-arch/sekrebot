import re, json, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open('AbsensiBot V.5.1 1.json', 'r', encoding='utf-8') as f:
    raw = f.read()

# Find SQL queries with broader context
# Look for PostgreSQL Execute nodes
pattern = r'"query":\s*"((?:[^"\\]|\\.){0,2000})"'
matches = re.findall(pattern, raw)

for i, m in enumerate(matches):
    decoded = m.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"')
    dl = decoded.lower()
    if 'user_list' in dl or 'view_user_mgmt' in dl or 'face_photo' in dl:
        print(f"=== Query {i+1} ===")
        print(decoded[:500])
        print()
