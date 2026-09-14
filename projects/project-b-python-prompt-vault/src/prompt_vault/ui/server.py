from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from prompt_vault.index.build import load_index, search


HTML = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prompt Vault</title>
<style>
:root{color-scheme:dark;--bg:#07070b;--panel:#101017;--ink:#f2f2f5;--muted:#92949c;--line:#30323d;--accent:#409cff}
*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink)}
header{padding:10px 12px;border-bottom:1px solid var(--line);background:var(--panel);display:flex;gap:16px;align-items:center;justify-content:space-between}
h1{font-size:20px;margin:0}.toolbar{display:grid;grid-template-columns:1.2fr repeat(3,minmax(120px,.4fr));gap:10px;padding:8px 10px;border-bottom:1px solid var(--line);background:#101017}
input,select,button{height:30px;border:1px solid var(--line);border-radius:6px;background:#171820;color:var(--ink);padding:0 10px;font-size:13px}
button{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:650;cursor:pointer}button.secondary{background:#171820;color:var(--ink);border-color:var(--line)}
main{padding:10px 12px}.actions{display:flex;gap:8px;margin-bottom:12px;align-items:center}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden}
th,td{text-align:left;border-bottom:1px solid var(--line);padding:7px 8px;font-size:12.5px;vertical-align:middle}th{font-size:12px;text-transform:uppercase;color:var(--muted);background:#14151d}
tr:last-child td{border-bottom:0}.status{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}.muted{color:var(--muted)}a{color:var(--accent);text-decoration:none}
@media(max-width:800px){.toolbar{grid-template-columns:1fr}table{display:block;overflow-x:auto;white-space:nowrap}header{align-items:flex-start;flex-direction:column}}
button:hover{background:#20222c}a{color:#64d2ff}input:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}tr:hover{background:#1a1d27}
</style>
</head>
<body>
<header><h1>Prompt Vault</h1><span class="muted" id="count"></span></header>
<section class="toolbar">
<input id="q" placeholder="Recherche">
<select id="source"><option value="">Source</option></select>
<select id="project"><option value="">Projet</option></select>
<select id="status"><option value="">Statut</option></select>
</section>
<main>
<div class="actions">
<button class="secondary" onclick="setAll(true)">Select all</button>
<button class="secondary" onclick="setAll(false)">Deselect all</button>
<button onclick="exportSelection()">Export selection</button>
</div>
<table><thead><tr><th>✓</th><th>Date</th><th>Age</th><th>Source</th><th>Title</th><th>Project</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table>
</main>
<script>
let data=[];const selected=new Set();
const age=(iso)=>{const d=new Date(iso);if(isNaN(d))return "";const days=Math.floor((Date.now()-d.getTime())/86400000);if(days<14)return days+" jours";if(days<70)return Math.floor(days/7)+" semaines";return Math.floor(days/30)+" mois"};
function fillOptions(id, values){const el=document.getElementById(id);[...new Set(values.filter(Boolean))].sort().forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;el.appendChild(o)})}
function filtered(){const q=document.getElementById("q").value.toLowerCase();return data.filter(r=>(!q||JSON.stringify(r).toLowerCase().includes(q))&&["source","project","status"].every(k=>!document.getElementById(k).value||r[k]===document.getElementById(k).value))}
function render(){const rows=filtered();document.getElementById("count").textContent=rows.length+" conversations";document.getElementById("rows").innerHTML=rows.map(r=>`<tr><td><input type="checkbox" ${selected.has(r.id)?"checked":""} onchange="this.checked?selected.add('${r.id}'):selected.delete('${r.id}')"></td><td>${(r.created||"").slice(0,10)}</td><td>${age(r.updated||r.created)}</td><td>${r.source}</td><td><a href="${r.source_url||'#'}">${r.title}</a></td><td>${r.project}</td><td class="status">${r.status}</td></tr>`).join("")}
function setAll(v){filtered().forEach(r=>v?selected.add(r.id):selected.delete(r.id));render()}
function exportSelection(){const rows=data.filter(r=>selected.has(r.id));const blob=new Blob([JSON.stringify(rows,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="prompt-vault-selection.json";a.click()}
fetch("/api/index").then(r=>r.json()).then(rows=>{data=rows;fillOptions("source",rows.map(r=>r.source));fillOptions("project",rows.map(r=>r.project));fillOptions("status",rows.map(r=>r.status));["q","source","project","status"].forEach(id=>document.getElementById(id).addEventListener("input",render));render()});
</script>
</body>
</html>"""


def serve(vault: Path, host: str = "127.0.0.1", port: int = 8765) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/api/index":
                self._json(load_index(vault))
                return
            if parsed.path == "/api/search":
                q = parse_qs(parsed.query).get("q", [""])[0]
                self._json(search(vault, q))
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.encode("utf-8"))

        def log_message(self, fmt: str, *args) -> None:
            return

        def _json(self, payload: object) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    ThreadingHTTPServer((host, port), Handler).serve_forever()
