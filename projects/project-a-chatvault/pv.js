#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const DEFAULT_PROJECTS = [
  "Nyx",
  "GroceryNanny",
  "COOPRO",
  "Prompt Management",
  "NoteCortex",
  "Centralis",
  "NotePlan",
  "Codex"
];

const DEFAULT_SCAN_KEYWORDS = [
  "BLOCAGE",
  "NEXT",
  "TODO",
  "décision",
  "erreur",
  "bug",
  "test",
  "commit",
  "export",
  "NotePlan",
  "Nyx",
  "NoteCortex",
  "Prompt Vault",
  "CTxKNL"
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else args[key] = argv[++i];
    } else {
      args._.push(a);
    }
  }
  return args;
}

function vaultRoot(args) {
  return path.resolve(args.vault || process.env.PROMPT_VAULT || path.join(process.cwd(), "PromptVault"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeProjectName(project) {
  const parts = String(project || "")
    .split("/")
    .map(p => p.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("project name required");
  if (parts.some(p => p === "." || p === ".." || p.includes("\0"))) {
    throw new Error("invalid project name");
  }
  return parts.join("/");
}

function projectDir(root, project) {
  const safe = safeProjectName(project);
  const base = path.join(root, "01_PROJECTS");
  const target = path.resolve(base, ...safe.split("/"));
  if (!target.startsWith(path.resolve(base) + path.sep)) throw new Error("invalid project path");
  return target;
}

function slug(input) {
  return String(input || "untitled")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

function duplicateTitleKey(title) {
  let text = String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  text = text.replace(/^[!#*._\-\s]+/, "").trim();
  text = text.replace(/^(?:[A-Z]\d+|\d+[A-Z]?|X)\s+/i, "").trim();
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function duplicateGroupKey(item) {
  return `${String(item.project || "")}::${duplicateTitleKey(item.title)}`;
}

function isNoisyPromptTitle(line) {
  const l = String(line || "").trim();
  return !l ||
    /^#+\s*(Objectif|Prompt|Contexte requis|Résultat attendu|Files mentioned by the user|In app browser|AGENTS\.md instructions)\s*:?\s*/i.test(l) ||
    /^<\/?(in-app-browser-context|recommended_plugins|codex_delegation)\b/i.test(l) ||
    /^The following is the Codex agent history added since your last approval assessment/i.test(l) ||
    /^Files mentioned by the user:?$/i.test(l) ||
    /^Here is a list of plugins that are available but not installed/i.test(l) ||
    /^---[A-Z _-]+---$/i.test(l) ||
    /^total\s+\d+$/i.test(l) ||
    /^[dl-][rwx-]{9}@?\s+\d+\s+/i.test(l) ||
    /^## Referenced ChatGPT conversation/i.test(l) ||
    /^\[external unsupported block:/i.test(l) ||
    /^\d+\s+/i.test(l) ||
    /^\d+$/i.test(l) ||
    /^(private var|final class|class |function |const |let |var )/i.test(l) ||
    /<(!DOCTYPE html|html|head|body)\b/i.test(l) ||
    /^===\s*.+\s*===$/.test(l) ||
    /^\.[\w-]+$/i.test(l) ||
    /(?:^|[\s"'])\/?[\w.-]+\/[\w./# -]+/.test(l) ||
    /^[\w.-]+\/$/.test(l);
}

function readablePromptTitle(markdown, fallback = "Prompt") {
  const body = String(markdown || "").replace(/^---\n[\s\S]*?\n---\n?/, "");
  const promptSection = (body.match(/^# Prompt\s*\n([\s\S]*?)(?=\n# |\n$)/m) || [])[1] || body;
  const line = promptSection
    .split(/\n+/)
    .map(l => l.trim())
    .map(l => l.replace(/^[-*]\s+/, "").replace(/^`{3,}\w*/, "").replace(/^#+\s*/, "").trim())
    .find(l => !isNoisyPromptTitle(l));
  return String(line || fallback)
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .slice(0, 120);
}

function groupedDuplicateRows(items) {
  const groups = new Map();
  for (const item of items) {
    const key = duplicateGroupKey(item);
    if (!key.endsWith("::")) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
  }
  const used = new Set();
  const out = [];
  for (const item of items) {
    if (used.has(item.id)) continue;
    const group = groups.get(duplicateGroupKey(item)) || [item];
    for (const member of group) used.add(member.id);
    out.push({ parent: group[0], duplicates: group.slice(1) });
  }
  return out;
}

function sha(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function yamlString(value) {
  return JSON.stringify(value == null ? "" : String(value));
}

function fileUrl(file) {
  return `file://${path.resolve(file).split(path.sep).map(encodeURIComponent).join("/")}`;
}

function walk(dir, pred, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

function createVault(root) {
  [
    "00_INBOX",
    "01_PROJECTS",
    "02_PROMPTS",
    "03_TEMPLATES",
    "90_DONE",
    "98_TRASH",
    "99_ARCHIVE",
    "RAW/chatgpt",
    "RAW/claude",
    "RAW/perplexity",
    "RAW/codex"
  ].forEach(d => ensureDir(path.join(root, d)));
  for (const project of DEFAULT_PROJECTS) {
    ensureProject(root, project);
  }
}

function ensureProject(root, project) {
  const safe = safeProjectName(project);
  const p = projectDir(root, safe);
  ensureDir(path.join(p, "chats"));
  ensureDir(path.join(p, "prompts"));
  const projectMd = path.join(p, "project.md");
  if (!fs.existsSync(projectMd)) {
    fs.writeFileSync(projectMd, [
      "---",
      `project: ${yamlString(safe)}`,
      "status: active",
      "---",
      "",
      `# ${safe}`,
      "",
      "## Résumé",
      "",
      "## Décisions",
      ""
    ].join("\n"));
  }
  return safe;
}

function projectNames(root, items = []) {
  const names = new Set(items.map(item => item.project).filter(Boolean));
  const base = path.join(root, "01_PROJECTS");
  for (const file of walk(base, p => path.basename(p) === "project.md")) {
    const rel = path.relative(base, path.dirname(file)).split(path.sep).join("/");
    if (rel && rel !== ".") names.add(rel);
  }
  return [...names].sort();
}

function codexRoots(args) {
  return [path.resolve(args.sourceRoot || path.join(os.homedir(), ".codex", "sessions"))];
}

function claudeRoots(args) {
  return [path.resolve(args.claudeRoot || args.sourceRoot || path.join(os.homedir(), ".claude", "projects"))];
}

function geminiRoots(args) {
  return [path.resolve(args.geminiRoot || args.sourceRoot || path.join(os.homedir(), ".gemini"))];
}

function sourceFiles(source, args) {
  const roots = source === "codex"
    ? codexRoots(args)
    : source === "claude"
      ? claudeRoots(args)
      : source === "gemini"
        ? geminiRoots(args)
        : [];
  return roots
    .flatMap(root => walk(root, p => p.endsWith(".jsonl")))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs || a.localeCompare(b));
}

function inputFiles(args) {
  return String(args.file || args.files || "")
    .split(",")
    .map(f => f.trim())
    .filter(Boolean)
    .map(f => path.resolve(f));
}

function inDateRange(file, args) {
  if (!args.from && !args.to) return true;
  const m = file.match(/sessions\/(\d{4})\/(\d{2})\/(\d{2})\//);
  const d = m ? `${m[1]}-${m[2]}-${m[3]}` : new Date(fs.statSync(file).mtimeMs).toISOString().slice(0, 10);
  if (args.from && d < args.from) return false;
  if (args.to && d > args.to) return false;
  return true;
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (!part || typeof part !== "object") return "";
      return part.text || part.content || part.value || "";
    }).filter(Boolean).join("\n");
  }
  return "";
}

function roleFromObject(obj) {
  if (obj.role) return obj.role;
  if (obj.type === "user") return "user";
  if (obj.type === "assistant") return "assistant";
  if (obj.message && obj.message.role) return obj.message.role;
  return "";
}

function codexMessagePayload(obj) {
  if (obj.type !== "response_item" || !obj.payload) return obj;
  if (obj.payload.type === "message") return obj.payload;
  return {};
}

function extractCodexMessages(raw) {
  const messages = [];
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let created = "";
  let updated = "";
  let sessionId = "";
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.timestamp) {
      created = created || obj.timestamp;
      updated = obj.timestamp;
    }
    if (obj.type === "session_meta" && obj.payload && obj.payload.id) {
      sessionId = obj.payload.id;
    } else if (obj.session_meta && obj.session_meta.payload && obj.session_meta.payload.id) {
      sessionId = obj.session_meta.payload.id;
    }
    const msg = codexMessagePayload(obj);
    const role = roleFromObject(msg);
    const direct = textFromContent(msg.content);
    const nested = msg.message ? textFromContent(msg.message.content) : "";
    const text = direct || nested;
    if ((role === "user" || role === "assistant" || role === "system") && text.trim()) {
      messages.push({
        role,
        content: text.trim(),
        created_at: obj.timestamp || ""
      });
    }
  }
  return { messages, created, updated, sessionId };
}

function extractClaudeMessages(raw) {
  const messages = [];
  let created = "";
  let updated = "";
  let sessionId = "";
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.timestamp) {
      created = created || obj.timestamp;
      updated = obj.timestamp;
    }
    sessionId = sessionId || obj.sessionId || "";
    const role = obj.message && obj.message.role ? obj.message.role : roleFromObject(obj);
    const content = obj.message ? textFromContent(obj.message.content) : textFromContent(obj.content);
    if ((role === "user" || role === "assistant" || role === "system") && content.trim()) {
      messages.push({ role, content: content.trim(), created_at: obj.timestamp || "" });
    }
  }
  return { messages, created, updated, sessionId };
}

function extractGeminiMessages(raw) {
  const messages = [];
  let created = "";
  let updated = "";
  let sessionId = "";
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.sessionId) sessionId = sessionId || obj.sessionId;
    if (obj.startTime) created = created || obj.startTime;
    if (obj.lastUpdated) updated = obj.lastUpdated;
    if (obj.timestamp) {
      created = created || obj.timestamp;
      updated = obj.timestamp;
    }
    const role = obj.type === "gemini" ? "assistant" : obj.type;
    const content = textFromContent(obj.content);
    if ((role === "user" || role === "assistant" || role === "system") && content.trim()) {
      messages.push({ role, content: content.trim(), created_at: obj.timestamp || "" });
    }
  }
  return { messages, created, updated, sessionId };
}

function chatGptContent(content) {
  if (!content) return "";
  if (Array.isArray(content.parts)) return content.parts.filter(p => typeof p === "string").join("\n");
  if (typeof content.text === "string") return content.text;
  return textFromContent(content);
}

function extractChatGptConversation(conv) {
  const nodes = Object.values(conv.mapping || {});
  const messages = nodes
    .map(node => node && node.message)
    .filter(Boolean)
    .filter(m => m.author && m.author.role && m.content)
    .map(m => ({
      role: m.author.role === "tool" ? "system" : m.author.role,
      content: chatGptContent(m.content).trim(),
      created_at: m.create_time ? new Date(m.create_time * 1000).toISOString() : ""
    }))
    .filter(m => ["user", "assistant", "system"].includes(m.role) && m.content);
  return {
    messages,
    created: conv.create_time ? new Date(conv.create_time * 1000).toISOString() : "",
    updated: conv.update_time ? new Date(conv.update_time * 1000).toISOString() : "",
    sessionId: conv.conversation_id || conv.id || ""
  };
}

function extractGenericJsonConversation(obj) {
  const rawMessages = Array.isArray(obj.messages) ? obj.messages : [];
  const messages = rawMessages.map((m, index) => ({
    role: m.role || (index % 2 === 0 ? "user" : "assistant"),
    content: textFromContent(m.content || m.text || m.markdown || "").trim(),
    created_at: m.created_at || m.created || m.timestamp || ""
  })).filter(m => ["user", "assistant", "system"].includes(m.role) && m.content);
  return {
    messages,
    created: obj.created || obj.created_at || obj.date || "",
    updated: obj.updated || obj.updated_at || obj.date || "",
    sessionId: obj.id || obj.conversation_id || obj.url || "",
    sourceUrl: obj.source_url || obj.url || ""
  };
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const data = {};
  if (!match) return { data, body: text };
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim();
    try {
      data[m[1]] = JSON.parse(value);
    } catch {
      data[m[1]] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { data, body: text.slice(match[0].length) };
}

function extractMarkdownConversation(raw, fallbackId) {
  const parsed = parseFrontmatter(raw);
  const chunks = [];
  const roleRe = /^(?:#{1,6}\s*)?(user|assistant|system|human|ai|chatgpt|perplexity)\s*:?\s*$/i;
  let current = null;
  for (const line of parsed.body.split(/\r?\n/)) {
    const m = line.trim().match(roleRe);
    if (m) {
      if (current && current.content.trim()) chunks.push(current);
      const roleName = m[1].toLowerCase();
      current = { role: ["human"].includes(roleName) ? "user" : ["ai", "chatgpt", "perplexity"].includes(roleName) ? "assistant" : roleName, content: "" };
    } else if (current) {
      current.content += `${line}\n`;
    }
  }
  if (current && current.content.trim()) chunks.push(current);
  const messages = chunks.length ? chunks.map(c => ({ role: c.role, content: c.content.trim(), created_at: parsed.data.date || "" })) : [
    { role: "user", content: parsed.body.trim(), created_at: parsed.data.date || "" }
  ].filter(m => m.content);
  return {
    messages,
    created: parsed.data.created || parsed.data.date || "",
    updated: parsed.data.updated || parsed.data.date || "",
    sessionId: parsed.data.source_url || parsed.data.url || fallbackId,
    sourceUrl: parsed.data.source_url || parsed.data.url || "",
    title: parsed.data.title || ""
  };
}

function titleFromMessages(messages, fallback) {
  const firstUser = messages.find(m => {
    const c = m.content.trim();
    return m.role === "user"
      && c
      && !c.startsWith("<recommended_plugins>")
      && !c.startsWith("<environment_context>");
  });
  const source = firstUser ? firstUser.content : fallback;
  return source.replace(/\s+/g, " ").trim().slice(0, 90) || fallback;
}

function classify(text) {
  const hay = text.toLowerCase();
  const hits = [];
  const rules = [
    ["Nyx", ["nyx", "nyxnote", "nyxnotes"]],
    ["GroceryNanny", ["grocerynanny", "grocery nanny"]],
    ["COOPRO", ["coopro"]],
    ["Prompt Management", ["prompt vault", "prompt master", "ctxknl", "prompt management"]],
    ["NoteCortex", ["notecortex", "nctx", "dashnctx"]],
    ["Centralis", ["centralis", "peak immobilier", "ag-centralis"]],
    ["NotePlan", ["noteplan"]],
    ["Codex", ["codex"]]
  ];
  for (const [project, words] of rules) {
    const score = words.reduce((n, word) => n + (hay.includes(word) ? 1 : 0), 0);
    if (score > 0) hits.push({ project, score });
  }
  hits.sort((a, b) => b.score - a.score || a.project.localeCompare(b.project));
  if (!hits.length) return { project: "00_INBOX", confidence: 0.25 };
  if (hits.length > 1 && hits[0].score === hits[1].score) return { project: "00_INBOX", confidence: 0.55 };
  return { project: hits[0].project, confidence: Math.min(0.95, 0.65 + hits[0].score * 0.15) };
}

function isReusableUserPrompt(content, source = "") {
  const text = String(content || "").trim();
  if (!text || text.length < 25) return false;
  if (/\b(prompt|charge ctxknl|tu es|objectif|procédure|procedure)\b/i.test(text)) return true;
  if (source === "chatgpt") {
    const firstLine = text.split(/\n+/).map(l => l.trim()).find(Boolean) || "";
    return text.length >= 40 && !isNoisyPromptTitle(firstLine);
  }
  return false;
}

function extractPrompts(messages, options = {}) {
  const source = options.source || "";
  return messages
    .filter(m => m.role === "user" && isReusableUserPrompt(m.content, source))
    .slice(0, 5)
    .map((m, i) => ({ position: i + 1, content: m.content, created_at: m.created_at || "" }));
}

function messagesFromChatMarkdown(text) {
  const messages = [];
  const re = /^###\s+\d+\.\s+([^\n]+)\n\n([\s\S]*?)(?=^###\s+\d+\.|\s*$)/gm;
  for (const match of String(text || "").matchAll(re)) {
    messages.push({ role: match[1].trim(), content: match[2].trim() });
  }
  return messages;
}

function rawDest(root, source, file, raw) {
  const id = sha(file + "\n" + raw).slice(0, 16);
  const year = (file.match(/sessions\/(\d{4})\//) || [])[1] || new Date().getFullYear();
  return { id, dest: path.join(root, "RAW", source, String(year), `${id}-${path.basename(file)}`) };
}

function writeRawOnce(dest, raw) {
  if (fs.existsSync(dest)) return false;
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, raw);
  return true;
}

function chatMarkdown(chat, messages, prompts) {
  const body = [
    "---",
    `id: ${chat.id}`,
    `source: ${chat.source}`,
    `source_id: ${yamlString(chat.source_id)}`,
    `source_url: ${yamlString(chat.source_url)}`,
    `project: ${yamlString(chat.project)}`,
    `created: ${yamlString(chat.created)}`,
    `updated: ${yamlString(chat.updated)}`,
    `imported: ${yamlString(chat.imported)}`,
    ...(chat.captured_at ? [`captured_at: ${yamlString(chat.captured_at)}`] : []),
    `status: ${chat.status}`,
    `deeplink: ${yamlString(chat.deeplink)}`,
    "tags:",
    ...chat.tags.map(t => `  - ${t}`),
    `confidence: ${chat.confidence.toFixed(2)}`,
    `raw_source: ${yamlString(chat.raw_source)}`,
    "---",
    "",
    `# ${chat.title}`,
    "",
    "## Résumé",
    "",
    "A compléter après validation humaine.",
    "",
    "## Demandes importantes",
    "",
    ...messages.filter(m => m.role === "user").slice(0, 5).map(m => `- ${m.content.replace(/\s+/g, " ").slice(0, 220)}`),
    "",
    "## Décisions prises",
    "",
    "## Résultats retenus",
    "",
    "## Prompts réutilisables",
    "",
    ...(prompts.length ? prompts.map(p => `- prompt extrait ${p.position}`) : ["Aucun prompt réutilisable détecté automatiquement."]),
    "",
    "## Liens associés",
    "",
    chat.source_url ? `- [Source originale](${chat.source_url})` : `- ${chat.deeplink}`,
    "",
    "## Source originale",
    "",
    `- RAW: ${chat.raw_source}`,
    "",
    "## Messages",
    "",
    ...messages.map((m, i) => `### ${i + 1}. ${m.role}\n\n${m.content}\n`)
  ];
  return body.join("\n");
}

function promptMarkdown(prompt, chat) {
  return [
    "---",
    `id: ${prompt.id}`,
    `project: ${yamlString(chat.project)}`,
    `origin_chat: ${chat.id}`,
    `source: ${yamlString(chat.source)}`,
    `source_id: ${yamlString(chat.source_id || "")}`,
    `source_url: ${yamlString(chat.source_url || "")}`,
    `created_at: ${yamlString(prompt.created_at || "")}`,
    `imported_at: ${yamlString(chat.imported || "")}`,
    ...(chat.captured_at ? [`captured_at: ${yamlString(chat.captured_at)}`] : []),
    "type: coding",
    "version: 1",
    "status: active",
    "tags:",
    "  - imported",
    "tools:",
    `  - ${chat.source}`,
    "parent_prompt:",
    "supersedes:",
    "---",
    "",
    "# Objectif",
    "",
    "# Prompt",
    "",
    prompt.content,
    "",
    "# Contexte requis",
    "",
    "# Résultat attendu",
    "",
    "# Notes",
    ""
  ].join("\n");
}

function curatedPath(root, chat) {
  if (chat.project === "00_INBOX" || chat.confidence < 0.75) {
    return path.join(root, "00_INBOX", `${chat.id}.md`);
  }
  return path.join(projectDir(root, chat.project), "chats", `${chat.id}.md`);
}

function removeOldCuratedCopies(root, id, keepPath) {
  const files = walk(root, p => p.endsWith(".md") && !p.includes(`${path.sep}RAW${path.sep}`));
  for (const file of files) {
    if (file === keepPath) continue;
    const head = fs.readFileSync(file, "utf8").slice(0, 300);
    if (head.includes(`id: ${id}`)) fs.rmSync(file);
  }
}

function sourceExtractor(source) {
  if (source === "codex") return extractCodexMessages;
  if (source === "claude") return extractClaudeMessages;
  if (source === "gemini") return extractGeminiMessages;
  if (source === "perplexity") return (raw, file) => {
    if (file && file.endsWith(".json")) { const value = JSON.parse(raw); return { ...extractGenericJsonConversation(value), title: value.title || "" }; }
    return extractMarkdownConversation(raw, file ? path.basename(file, path.extname(file)) : "");
  };
  throw new Error(`source non supportée en V0: ${source}`);
}

function importSourceFile(root, source, file) {
  const raw = fs.readFileSync(file, "utf8");
  const rawInfo = rawDest(root, source, file, raw);
  writeRawOnce(rawInfo.dest, raw);
  const parsed = sourceExtractor(source)(raw, file);
  const title = parsed.title || titleFromMessages(parsed.messages, path.basename(file, path.extname(file)));
  const text = `${title}\n${parsed.messages.map(m => m.content).join("\n")}`;
  const cls = classify(text);
  const id = `pv_chat_${rawInfo.id}`;
  const imported = new Date().toISOString();
  const rawRel = path.relative(path.dirname(curatedPath(root, { id, project: cls.project, confidence: cls.confidence })), rawInfo.dest);
  const chat = {
    id,
    source,
    source_id: parsed.sessionId || path.basename(file, ".jsonl").replace(/^rollout-/, ""),
    source_url: parsed.sourceUrl || fileUrl(rawInfo.dest),
    project: cls.confidence >= 0.75 ? cls.project : "00_INBOX",
    created: parsed.created,
    updated: parsed.updated || parsed.created,
    imported,
    status: "inbox",
    tags: [source],
    confidence: cls.confidence,
    raw_source: rawRel,
    deeplink: `promptvault://chat/${id}`,
    title
  };
  const chatPath = curatedPath(root, chat);
  removeOldCuratedCopies(root, id, chatPath);
  ensureDir(path.dirname(chatPath));
  const prompts = extractPrompts(parsed.messages, { source });
  fs.writeFileSync(chatPath, chatMarkdown(chat, parsed.messages, prompts));
  for (const p of prompts) {
    const pid = `pv_prompt_${sha(id + p.content).slice(0, 16)}`;
    const promptPath = path.join(root, "02_PROMPTS", `${pid}.md`);
    if (!fs.existsSync(promptPath)) fs.writeFileSync(promptPath, promptMarkdown({ ...p, id: pid }, chat));
  }
  return { ...chat, path: path.relative(root, chatPath), prompt_count: prompts.length };
}

function importCodexFile(root, file) {
  return importSourceFile(root, "codex", file);
}

function importChatGptFile(root, file) {
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);
  const conversations = Array.isArray(parsed) ? parsed : Array.isArray(parsed.conversations) ? parsed.conversations : [parsed];
  const imported = [];
  for (const conv of conversations) {
    const rawOne = JSON.stringify(conv, null, 2);
    const rawInfo = rawDest(root, "chatgpt", `${file}:${conv.conversation_id || conv.id || imported.length}`, rawOne);
    writeRawOnce(rawInfo.dest, rawOne);
    const data = extractChatGptConversation(conv);
    const title = conv.title || titleFromMessages(data.messages, path.basename(file, path.extname(file)));
    const text = `${title}\n${data.messages.map(m => m.content).join("\n")}`;
    const cls = classify(text);
    const id = `pv_chat_${rawInfo.id}`;
    const chat = {
      id,
      source: "chatgpt",
      source_id: data.sessionId,
      captured_at: typeof conv.capture?.captured_at === "string" && Number.isFinite(Date.parse(conv.capture.captured_at)) ? new Date(conv.capture.captured_at).toISOString() : "",
      source_url: conv.url || conv.source_url || "",
      project: cls.confidence >= 0.75 ? cls.project : "00_INBOX",
      created: data.created,
      updated: data.updated || data.created,
      imported: new Date().toISOString(),
      status: "inbox",
      tags: ["chatgpt"],
      confidence: cls.confidence,
      raw_source: "",
      deeplink: `promptvault://chat/${id}`,
      title
    };
    const chatPath = curatedPath(root, chat);
    chat.raw_source = path.relative(path.dirname(chatPath), rawInfo.dest);
    if (!chat.source_url) chat.source_url = fileUrl(rawInfo.dest);
    removeOldCuratedCopies(root, id, chatPath);
    ensureDir(path.dirname(chatPath));
    const prompts = extractPrompts(data.messages, { source: "chatgpt" });
    fs.writeFileSync(chatPath, chatMarkdown(chat, data.messages, prompts));
    for (const p of prompts) {
      const pid = `pv_prompt_${sha(id + p.content).slice(0, 16)}`;
      const promptPath = path.join(root, "02_PROMPTS", `${pid}.md`);
      if (!fs.existsSync(promptPath)) fs.writeFileSync(promptPath, promptMarkdown({ ...p, id: pid }, chat));
    }
    imported.push({ ...chat, path: path.relative(root, chatPath), prompt_count: prompts.length });
  }
  return imported;
}

function rebuildIndex(root) {
  createVault(root);
  const files = walk(root, p => p.endsWith(".md") && !p.includes(`${path.sep}RAW${path.sep}`));
  const items = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    if (!fm || !/^id:\s*pv_chat_/m.test(fm[1])) continue;
    const get = key => {
      const m = fm[1].match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
      if (!m) return "";
      const v = m[1].trim();
      try { return JSON.parse(v); } catch { return v; }
    };
    const title = (text.match(/^#\s+(.+)$/m) || [])[1] || get("id");
    const rawSource = get("raw_source");
    const sourceUrl = get("source_url") || (rawSource ? fileUrl(path.resolve(path.dirname(file), rawSource)) : "");
    items.push({
      id: get("id"),
      title,
      project: get("project"),
      source: get("source"),
      created: get("created"),
      updated: get("updated"),
      status: get("status"),
      tags: [...fm[1].matchAll(/^\s+-\s+(.+)$/gm)].map(m => m[1]),
      source_url: sourceUrl,
      deeplink: get("deeplink") || `promptvault://chat/${get("id")}`,
      path: path.relative(root, file)
    });
  }
  items.sort((a, b) => String(b.updated).localeCompare(String(a.updated)) || a.title.localeCompare(b.title));
  fs.writeFileSync(path.join(root, "index.json"), JSON.stringify({ version: 1, rebuilt_at: new Date().toISOString(), items }, null, 2));
  return items;
}

function promptItems(root, chatItems = []) {
  const byChatId = Object.fromEntries(chatItems.map(item => [item.id, item]));
  const files = walk(path.join(root, "02_PROMPTS"), p => p.endsWith(".md"));
  return files.map(file => {
    const text = fs.readFileSync(file, "utf8");
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    const get = key => {
      if (!fm) return "";
      const m = fm[1].match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
      if (!m) return "";
      const v = m[1].trim();
      try { return JSON.parse(v); } catch { return v; }
    };
    const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
    const chars = body.length;
    const originChat = get("origin_chat");
    const origin = byChatId[originChat] || {};
    const tools = [...(fm ? fm[1].matchAll(/^\s+-\s+(.+)$/gm) : [])].map(m => m[1]);
    const source = origin.source || tools.find(t => ["codex", "claude", "gemini", "chatgpt", "perplexity"].includes(t)) || "";
    const sourceUrl = /^(https?:)?\/\//.test(origin.source_url || "") ? origin.source_url : "";
    return {
      id: get("id") || path.basename(file, ".md"),
      project: get("project"),
      source,
      origin_chat: originChat,
      chat_title: origin.title || originChat,
      chat_url: sourceUrl,
      chat_updated: origin.updated || "",
      status: get("status"),
      title: readablePromptTitle(text, origin.title || get("id") || path.basename(file, ".md")),
      chars,
      kchars: Math.round(chars / 100) / 10,
      path: path.relative(root, file)
    };
  }).sort((a, b) => a.project.localeCompare(b.project) || a.id.localeCompare(b.id));
}

function loadIndex(root) {
  const indexPath = path.join(root, "index.json");
  if (!fs.existsSync(indexPath)) rebuildIndex(root);
  return JSON.parse(fs.readFileSync(indexPath, "utf8")).items || [];
}

function backfillPrompts(root, params = {}) {
  createVault(root);
  const sourceFilter = params.source || "";
  const items = loadIndex(root).filter(item => !sourceFilter || item.source === sourceFilter);
  let created = 0;
  let scanned = 0;
  for (const chat of items) {
    if (!chat.path) continue;
    const chatPath = path.join(root, chat.path);
    if (!fs.existsSync(chatPath)) continue;
    const text = fs.readFileSync(chatPath, "utf8");
    const messages = messagesFromChatMarkdown(text);
    const prompts = extractPrompts(messages, { source: chat.source });
    if (!prompts.length) continue;
    scanned++;
    for (const p of prompts) {
      const pid = `pv_prompt_${sha(chat.id + p.content).slice(0, 16)}`;
      const promptPath = path.join(root, "02_PROMPTS", `${pid}.md`);
      if (fs.existsSync(promptPath)) continue;
      ensureDir(path.dirname(promptPath));
      fs.writeFileSync(promptPath, promptMarkdown({ ...p, id: pid }, chat));
      created++;
    }
  }
  rebuildIndex(root);
  return { chats_scanned: scanned, prompts_created: created };
}

function itemText(root, item) {
  if (!root || !item.path) return "";
  try {
    return fs.readFileSync(path.join(root, item.path), "utf8");
  } catch {
    return "";
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scanKeywords(params = {}) {
  const raw = String(params.keywords || params.q || "").trim();
  const words = raw
    ? raw.split(/[,;\n]+/).map(k => k.trim()).filter(Boolean)
    : DEFAULT_SCAN_KEYWORDS;
  return [...new Set(words)];
}

function tokenizeBooleanQuery(query) {
  const tokens = [];
  const re = /"([^"]+)"|'([^']+)'|\(|\)|\bAND\b|\bOR\b|\bNOT\b|[^\s()]+/gi;
  for (const match of String(query || "").matchAll(re)) {
    const value = match[1] || match[2] || match[0];
    const upper = value.toUpperCase();
    tokens.push(["AND", "OR", "NOT"].includes(upper) ? upper : value);
  }
  return tokens;
}

function parseBooleanQuery(query) {
  const tokens = tokenizeBooleanQuery(query);
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];

  function parsePrimary() {
    if (peek() === "(") {
      take();
      const node = parseOr();
      if (peek() === ")") take();
      return node;
    }
    const value = take();
    return value ? { type: "term", value } : { type: "term", value: "" };
  }

  function parseNot() {
    if (peek() === "NOT") {
      take();
      return { type: "not", node: parseNot() };
    }
    return parsePrimary();
  }

  function parseAnd() {
    let node = parseNot();
    while (peek() && peek() !== ")" && peek() !== "OR") {
      if (peek() === "AND") take();
      node = { type: "and", left: node, right: parseNot() };
    }
    return node;
  }

  function parseOr() {
    let node = parseAnd();
    while (peek() === "OR") {
      take();
      node = { type: "or", left: node, right: parseAnd() };
    }
    return node;
  }

  return tokens.length ? parseOr() : null;
}

function booleanQuery(raw) {
  const query = String(raw || "").trim();
  if (!query || !/\b(?:AND|OR|NOT)\b|[()'"]/i.test(query)) return null;
  const ast = parseBooleanQuery(query);
  const terms = [];
  function collect(node, negated = false) {
    if (!node) return;
    if (node.type === "term" && node.value && !negated) terms.push(node.value);
    if (node.type === "not") collect(node.node, true);
    if (node.type === "and" || node.type === "or") {
      collect(node.left, negated);
      collect(node.right, negated);
    }
  }
  collect(ast);
  return { raw: query, ast, terms: [...new Set(terms)] };
}

function termOccurrences(text, term) {
  if (!term) return [];
  return [...String(text).matchAll(new RegExp(escapeRegExp(term), "gi"))];
}

function evalBooleanQuery(node, text) {
  if (!node) return true;
  if (node.type === "term") return termOccurrences(text, node.value).length > 0;
  if (node.type === "not") return !evalBooleanQuery(node.node, text);
  if (node.type === "and") return evalBooleanQuery(node.left, text) && evalBooleanQuery(node.right, text);
  if (node.type === "or") return evalBooleanQuery(node.left, text) || evalBooleanQuery(node.right, text);
  return true;
}

function scanTargets(root, params = {}) {
  const scope = params.scope || "all";
  const targets = [];
  if (scope === "all" || scope === "chats") {
    targets.push(...exportItems(loadIndex(root), params, root).map(item => ({ ...item, kind: "chat" })));
  }
  if (scope === "all" || scope === "prompts") {
    targets.push(...promptItems(root, loadIndex(root)).map(item => ({ ...item, kind: "prompt", source: item.source || "prompt" })));
  }
  return targets;
}

function excerptAround(text, index, length) {
  const start = Math.max(0, index - length);
  const end = Math.min(text.length, index + length);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function contextCitation(item, text, hits, context) {
  const firstKeyword = Object.keys(hits)[0];
  const firstMatch = firstKeyword ? termOccurrences(text, firstKeyword)[0] : null;
  const excerpt = excerptAround(text, firstMatch ? firstMatch.index || 0 : 0, context);
  return {
    ref: `${item.kind}:${item.id}`,
    title: item.title || item.id,
    path: item.path,
    project: item.project || "",
    source: item.source || "",
    occurrences: Object.values(hits).reduce((sum, n) => sum + n, 0),
    excerpt
  };
}

function deepScan(root, params = {}) {
  const rawQuery = String(params.keywords || params.q || "").trim();
  const expression = booleanQuery(rawQuery);
  const keywords = expression ? expression.terms : scanKeywords(params);
  const context = Number(params.context || 120);
  const maxPerKeyword = Number(params.max || 12);
  const targets = scanTargets(root, params);
  const byKeyword = Object.fromEntries(keywords.map(keyword => [keyword, {
    keyword,
    occurrences: 0,
    files: 0,
    matches: []
  }]));
  const byProject = {};
  const bySource = {};
  const byKind = {};
  const fileHits = [];

  for (const item of targets) {
    const text = itemText(root, item);
    if (!text) continue;
    const hits = {};
    for (const keyword of keywords) {
      const matches = termOccurrences(text, keyword);
      if (!matches.length) continue;
      hits[keyword] = matches.length;
      byKeyword[keyword].occurrences += matches.length;
      byKeyword[keyword].files += 1;
      for (const match of matches.slice(0, Math.max(0, maxPerKeyword - byKeyword[keyword].matches.length))) {
        byKeyword[keyword].matches.push({
          id: item.id,
          kind: item.kind,
          source: item.source || "",
          project: item.project || "",
          status: item.status || "",
          title: item.title || item.id,
          path: item.path,
          excerpt: excerptAround(text, match.index || 0, context)
        });
      }
    }
    const total = Object.values(hits).reduce((sum, n) => sum + n, 0);
    if (!total) continue;
    if (expression && !evalBooleanQuery(expression.ast, text)) continue;
    const citation = contextCitation(item, text, hits, context);
    byProject[item.project || "(vide)"] = (byProject[item.project || "(vide)"] || 0) + total;
    bySource[item.source || "(vide)"] = (bySource[item.source || "(vide)"] || 0) + total;
    byKind[item.kind] = (byKind[item.kind] || 0) + total;
    fileHits.push({
      id: item.id,
      kind: item.kind,
      source: item.source || "",
      project: item.project || "",
      status: item.status || "",
      created: item.created || "",
      updated: item.updated || item.chat_updated || item.created || "",
      title: item.title || item.id,
      path: item.path,
      total,
      hits,
      citation
    });
  }

  fileHits.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
  return {
    generated_at: new Date().toISOString(),
    vault: root,
    scope: params.scope || "all",
    query_mode: expression ? "boolean" : "keywords",
    query: expression ? expression.raw : keywords.join(","),
    keywords,
    scanned_files: targets.length,
    matched_files: fileHits.length,
    totals: {
      occurrences: fileHits.reduce((sum, item) => sum + item.total, 0),
      by_project: byProject,
      by_source: bySource,
      by_kind: byKind
    },
    keywords_report: Object.values(byKeyword).sort((a, b) => b.occurrences - a.occurrences || a.keyword.localeCompare(b.keyword)),
    files: fileHits
  };
}

function scanExportItems(root, params = {}) {
  const ids = new Set(String(params.ids || "").split(",").map(v => v.trim()).filter(Boolean));
  if (!ids.size) return deepScan(root, params).files;
  if (params.keywords || params.q) {
    return deepScan(root, { ...params, ids: "", scope: "all" }).files.filter(item => {
      return ids.has(`${item.kind}:${item.id}`) || ids.has(item.id);
    });
  }
  const { ids: _ids, ...scanParams } = params;
  return scanTargets(root, { ...scanParams, scope: "all" }).filter(item => {
    return ids.has(`${item.kind}:${item.id}`) || ids.has(item.id);
  });
}

function sortedScanFiles(files, params = {}) {
  const key = params.sort || "total";
  const dir = params.dir === "asc" ? 1 : -1;
  const value = item => {
    if (key === "total") return Number(item.total || 0);
    if (key === "kind") return item.kind || "";
    if (key === "source") return item.source || "";
    if (key === "project") return item.project || "";
    if (key === "title") return item.title || "";
    if (key === "updated" || key === "date") return item.updated || item.created || "";
    if (key === "detail") return Object.entries(item.hits || {}).map(([k, v]) => `${k}:${v}`).join(", ");
    if (key === "citation") return item.citation ? item.citation.excerpt : "";
    return item[key] || "";
  };
  return [...files].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (typeof av === "number" || typeof bv === "number") return ((av || 0) - (bv || 0)) * dir;
    return String(av).localeCompare(String(bv)) * dir || String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function crc32(buffer) {
  if (!crc32.table) {
    crc32.table = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
  }
  let c = 0xffffffff;
  for (const byte of buffer) c = crc32.table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const now = dosDateTime();
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data || ""), "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function safeFileName(value) {
  return slug(String(value || "item")).replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

function scanZip(root, items, params = {}) {
  const files = items.map((item, index) => {
    const parts = [
      String(index + 1).padStart(3, "0"),
      safeFileName(item.kind),
      safeFileName(item.source),
      safeFileName(item.project),
      safeFileName(item.title || item.id)
    ].filter(Boolean);
    return {
      name: `${parts.join("-")}.md`,
      data: exportMarkdown(root, [item], { ...params, global_frontmatter: "0" })
    };
  });
  files.unshift({
    name: "manifest.json",
    data: JSON.stringify({
      generated_at: new Date().toISOString(),
      count: items.length,
      query: params.keywords || params.q || "",
      items: items.map(item => ({
        id: item.id,
        kind: item.kind,
        source: item.source,
        project: item.project,
        title: item.title,
        path: item.path,
        total: item.total
      }))
    }, null, 2)
  });
  return zipStore(files);
}

function scanMarkdown(report) {
  const lines = [
    `# Prompt Vault Deep Scan`,
    "",
    `- generated_at: ${report.generated_at}`,
    `- scope: ${report.scope}`,
    `- query_mode: ${report.query_mode}`,
    `- query: ${report.query}`,
    `- scanned_files: ${report.scanned_files}`,
    `- matched_files: ${report.matched_files}`,
    `- occurrences: ${report.totals.occurrences}`,
    "",
    "## Keywords",
    "",
    "| Keyword | Occurrences | Files |",
    "| --- | ---: | ---: |",
    ...report.keywords_report.map(row => `| ${row.keyword} | ${row.occurrences} | ${row.files} |`),
    "",
    "## Top Files",
    "",
    "| Hits | Kind | Source | Project | Status | Title | Path |",
    "| ---: | --- | --- | --- | --- | --- | --- |",
    ...report.files.slice(0, 80).map(item => `| ${item.total} | ${item.kind} | ${item.source} | ${item.project} | ${item.status} | ${String(item.title).replace(/\|/g, "\\|")} | ${item.path} |`),
    "",
    "## Context Citations",
    "",
    ...report.files.slice(0, 80).map(item => `- ${item.citation.ref} · ${item.citation.occurrences} occurrence(s) · ${item.citation.path}\n  - ${item.citation.excerpt}`),
    "",
    "## Excerpts",
    ""
  ];
  for (const row of report.keywords_report.filter(row => row.occurrences > 0)) {
    lines.push(`### ${row.keyword}`, "");
    for (const match of row.matches) {
      lines.push(`- ${match.project || "(vide)"} / ${match.source} / ${match.kind} / ${match.title}`);
      lines.push(`  - path: ${match.path}`);
      lines.push(`  - extrait: ${match.excerpt}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

function deepScanCommand(args) {
  const root = vaultRoot(args);
  const report = deepScan(root, args);
  const outDir = path.resolve(args.out || path.join(process.cwd(), "reports"));
  ensureDir(outDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = path.join(outDir, `scan-keywords-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  fs.writeFileSync(`${base}.md`, scanMarkdown(report));
  console.log(`scanned: ${report.scanned_files}`);
  console.log(`matched: ${report.matched_files}`);
  console.log(`occurrences: ${report.totals.occurrences}`);
  console.log(`markdown: ${base}.md`);
  console.log(`json: ${base}.json`);
}

function matchesItemQuery(root, item, q, fullText = false, mode = "contains") {
  if (!q) return true;
  const indexed = JSON.stringify(item);
  const text = fullText ? `${indexed}\n${itemText(root, item)}` : indexed;
  return matchesQueryText(text, q, mode);
}

function queryTerms(q) {
  const raw = String(q || "").trim();
  if (!raw) return [];
  const quoted = [...raw.matchAll(/"([^"]+)"|'([^']+)'/g)].map(match => match[1] || match[2]).filter(Boolean);
  const rest = raw.replace(/"[^"]+"|'[^']+'/g, " ").trim();
  const split = rest.includes(",") || rest.includes(";") || rest.includes("\n")
    ? rest.split(/[,;\n]+/)
    : rest.split(/\s+/);
  return [...new Set([...quoted, ...split].map(term => term.trim()).filter(Boolean))];
}

function matchesQueryText(text, q, mode = "contains") {
  const haystack = String(text || "");
  const raw = String(q || "").trim();
  if (!raw) return true;
  if (mode === "boolean") {
    const expression = booleanQuery(raw);
    return expression ? evalBooleanQuery(expression.ast, haystack) : haystack.toLowerCase().includes(raw.toLowerCase());
  }
  const terms = queryTerms(raw);
  if (!terms.length) return true;
  if (mode === "and") return terms.every(term => termOccurrences(haystack, term).length > 0);
  if (mode === "or") return terms.some(term => termOccurrences(haystack, term).length > 0);
  return haystack.toLowerCase().includes(raw.toLowerCase());
}

function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function doctor(args) {
  const root = vaultRoot(args);
  const git = spawnSync("git", ["status", "--short", "--branch"], { cwd: process.cwd(), encoding: "utf8" });
  const remote = spawnSync("git", ["remote", "-v"], { cwd: process.cwd(), encoding: "utf8" });
  const codex = sourceFiles("codex", args).length;
  const claude = sourceFiles("claude", args).length;
  const gemini = sourceFiles("gemini", args).length;
  console.log(`vault: ${root}`);
  console.log(`vault_exists: ${fs.existsSync(root)}`);
  console.log(`codex_sessions: ${codex}`);
  console.log(`claude_sessions: ${claude}`);
  console.log(`gemini_sessions: ${gemini}`);
  console.log(`git_status: ${(git.stdout || git.stderr || "").trim() || "unavailable"}`);
  console.log(`git_remote: ${(remote.stdout || "").trim() || "remote GitHub absent"}`);
}

function importCommand(args) {
  const root = vaultRoot(args);
  createVault(root);
  const source = args.source || "codex";
  const sources = source === "all" ? ["codex", "claude", "gemini"] : [source];
  const imported = [];
  for (const src of sources) {
    let files = inputFiles(args);
    if (!files.length) files = sourceFiles(src, args).filter(file => inDateRange(file, args));
    if (args.limit) files = files.slice(0, Number(args.limit));
    for (const file of files) {
      if (src === "chatgpt") imported.push(...importChatGptFile(root, file));
      else imported.push(importSourceFile(root, src, file));
    }
  }
  const index = rebuildIndex(root);
  console.log(`imported: ${imported.length}`);
  console.log(`indexed: ${index.length}`);
  console.log(`sources: ${sources.join(",")}`);
  console.log(`vault: ${root}`);
}

function search(args) {
  const root = vaultRoot(args);
  const q = (args._.slice(1).join(" ") || args.q || "").toLowerCase();
  if (!q) {
    console.error('Usage: pv search "terme"');
    process.exit(1);
  }
  const rows = loadIndex(root).filter(item => JSON.stringify(item).toLowerCase().includes(q));
  for (const item of rows) console.log(`${item.id}\t${item.source}\t${item.project}\t${item.status}\t${item.title}\t${item.path}`);
}

function projects(args) {
  const root = vaultRoot(args);
  const counts = new Map();
  for (const item of loadIndex(root)) counts.set(item.project, (counts.get(item.project) || 0) + 1);
  for (const project of projectNames(root, loadIndex(root))) console.log(`${project}\t${counts.get(project) || 0}`);
}

function inbox(args) {
  const root = vaultRoot(args);
  for (const item of loadIndex(root).filter(i => i.project === "00_INBOX" || i.status === "inbox")) {
    console.log(`${item.id}\t${item.source}\t${item.project}\t${item.title}\t${item.path}`);
  }
}

function prompts(args) {
  const root = vaultRoot(args);
  const q = (args._.slice(1).join(" ") || args.q || "").toLowerCase();
  const rows = promptItems(root, loadIndex(root)).filter(item => !q || JSON.stringify(item).toLowerCase().includes(q));
  for (const item of rows) console.log(`${item.id}\t${item.source}\t${item.project}\t${item.kchars}K\t${item.status}\t${item.origin_chat}\t${item.path}`);
}

function exportSelection(args) {
  const root = vaultRoot(args);
  const out = path.resolve(args.out || path.join(root, "export.md"));
  const ids = new Set(String(args.ids || "").split(",").filter(Boolean));
  const items = loadIndex(root).filter(item => !ids.size || ids.has(item.id));
  const content = exportMarkdown(root, items);
  fs.writeFileSync(out, content);
  console.log(`exported: ${items.length}`);
  console.log(`file: ${out}`);
}

function exportItems(items, params = {}, root = "") {
  const ids = new Set(String(params.ids || "").split(",").filter(Boolean));
  let rows = items;
  if (ids.size) rows = rows.filter(item => ids.has(item.id));
  else if (!params.status && params.include_deleted !== "1") rows = rows.filter(item => item.status !== "deleted");
  if (params.q) rows = rows.filter(item => matchesItemQuery(root, item, params.q, params.full_text === "1", params.q_mode || "contains"));
  if (params.project) rows = rows.filter(item => item.project === params.project);
  if (params.source) rows = rows.filter(item => item.source === params.source);
  if (params.status) rows = rows.filter(item => item.status === params.status);
  return rows;
}

function exportFrontmatter(items, params = {}) {
  const values = key => [...new Set(items.map(item => item[key]).filter(Boolean))].sort();
  const lines = [
    "---",
    `exported_at: ${yamlString(new Date().toISOString())}`,
    `scope: ${yamlString(params.ids ? "selected" : "filtered")}`,
    `count: ${items.length}`,
    "sources:",
    ...values("source").map(v => `  - ${yamlString(v)}`),
    "projects:",
    ...values("project").map(v => `  - ${yamlString(v)}`),
    "statuses:",
    ...values("status").map(v => `  - ${yamlString(v)}`),
    "options:",
    `  keep_frontmatter: ${params.keep_frontmatter === "0" ? "false" : "true"}`,
    `  keep_raw_links: ${params.keep_raw === "0" ? "false" : "true"}`,
    "---",
    ""
  ];
  return lines.join("\n");
}

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function stripRawLinks(text) {
  return text
    .split("\n")
    .filter(line => !/^(source_url|raw_source):\s*/.test(line))
    .join("\n")
    .replace(/\n## Source originale\n\n- RAW:[^\n]*(?:\n|$)/, "\n");
}

function exportMarkdown(root, items, params = {}) {
  const docs = items.map(item => {
    let text = fs.readFileSync(path.join(root, item.path), "utf8");
    if (params.keep_raw === "0") text = stripRawLinks(text);
    if (params.keep_frontmatter === "0") text = stripFrontmatter(text);
    const citation = item.citation && params.scan_citations !== "0"
      ? [
        `> Contexte scan: ${item.citation.ref} · ${item.citation.occurrences} occurrence(s) · ${item.citation.path}`,
        `> ${item.citation.excerpt}`,
        ""
      ].join("\n")
      : "";
    return `${citation}${text.trim()}`;
  }).join("\n\n---\n\n");
  return `${params.global_frontmatter === "1" ? exportFrontmatter(items, params) : ""}${docs}\n`;
}

function setFrontmatterValue(text, key, value) {
  const lines = text.split("\n");
  let inFm = false;
  let done = false;
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 && lines[i] === "---") {
      inFm = true;
      continue;
    }
    if (inFm && lines[i] === "---") break;
    if (inFm && lines[i].startsWith(`${key}:`)) {
      lines[i] = `${key}: ${value}`;
      done = true;
      break;
    }
  }
  if (!done && inFm) lines.splice(1, 0, `${key}: ${value}`);
  return lines.join("\n");
}

function assign(args) {
  const root = vaultRoot(args);
  const project = safeProjectName(args.project);
  const ids = new Set(String(args.ids || "").split(",").filter(Boolean));
  if (!project || !ids.size) {
    console.error("Usage: pv assign --ids id1,id2 --project Nyx");
    process.exit(1);
  }
  ensureProject(root, project);
  const index = loadIndex(root).filter(item => ids.has(item.id));
  for (const item of index) {
    const oldPath = path.join(root, item.path);
    let text = fs.readFileSync(oldPath, "utf8");
    text = setFrontmatterValue(text, "project", yamlString(project));
    const next = path.join(projectDir(root, project), "chats", `${item.id}.md`);
    ensureDir(path.dirname(next));
    fs.writeFileSync(next, text);
    if (oldPath !== next) fs.rmSync(oldPath);
  }
  rebuildIndex(root);
  console.log(`assigned: ${index.length}`);
}

function archiveCommand(args) {
  const root = vaultRoot(args);
  const ids = new Set(String(args.ids || args.id || "").split(",").filter(Boolean));
  if (!ids.size) {
    console.error("Usage: pv archive --ids id1,id2");
    process.exit(1);
  }
  ensureDir(path.join(root, "99_ARCHIVE"));
  const index = loadIndex(root).filter(item => ids.has(item.id));
  for (const item of index) {
    const oldPath = path.join(root, item.path);
    if (!fs.existsSync(oldPath)) continue;
    const text = setFrontmatterValue(fs.readFileSync(oldPath, "utf8"), "status", "archived");
    const next = path.join(root, "99_ARCHIVE", `${item.id}.md`);
    fs.writeFileSync(next, text);
    if (oldPath !== next) fs.rmSync(oldPath);
  }
  rebuildIndex(root);
  console.log(`archived: ${index.length}`);
}

function deleteCommand(args) {
  const root = vaultRoot(args);
  const ids = new Set(String(args.ids || args.id || "").split(",").filter(Boolean));
  if (!ids.size) {
    console.error("Usage: pv delete --ids id1,id2");
    process.exit(1);
  }
  ensureDir(path.join(root, "98_TRASH"));
  const index = loadIndex(root).filter(item => ids.has(item.id));
  for (const item of index) {
    const oldPath = path.join(root, item.path);
    if (!fs.existsSync(oldPath)) continue;
    const text = setFrontmatterValue(fs.readFileSync(oldPath, "utf8"), "status", "deleted");
    const next = path.join(root, "98_TRASH", `${item.id}.md`);
    fs.writeFileSync(next, text);
    if (oldPath !== next) fs.rmSync(oldPath);
  }
  rebuildIndex(root);
  console.log(`deleted: ${index.length}`);
}

function createProjectCommand(args) {
  const root = vaultRoot(args);
  createVault(root);
  const project = ensureProject(root, args.project || args.name);
  console.log(`project: ${project}`);
}

function renameProjectCommand(args) {
  const root = vaultRoot(args);
  createVault(root);
  const from = safeProjectName(args.from || args.old);
  const to = ensureProject(root, args.to || args.project || args.name);
  const oldDir = projectDir(root, from);
  const affected = loadIndex(root).filter(i => i.project === from || i.project.startsWith(`${from}/`));
  for (const item of affected) {
    const file = path.join(root, item.path);
    if (!fs.existsSync(file)) continue;
    const nextProject = item.project === from ? to : `${to}/${item.project.slice(from.length + 1)}`;
    const text = setFrontmatterValue(fs.readFileSync(file, "utf8"), "project", yamlString(nextProject));
    const dest = path.join(projectDir(root, nextProject), "chats", `${item.id}.md`);
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, text);
    if (file !== dest && fs.existsSync(file)) fs.rmSync(file);
  }
  if (fs.existsSync(oldDir)) {
    const projectMd = path.join(oldDir, "project.md");
    if (fs.existsSync(projectMd)) fs.rmSync(projectMd);
  }
  rebuildIndex(root);
  console.log(`renamed: ${from} -> ${to}`);
}

function vaultCss() {
  return `
  :root{
    --ink-0:#07070b;--ink-1:#101017;--ink-2:#171820;--ink-3:#20222c;--ink-4:#30323d;
    --bone-0:#f2f2f5;--bone-1:#c4c5ca;--bone-2:#92949c;--bone-3:#5c5f6b;
    --blue:#409cff;--teal:#64d2ff;--green:#30d158;--orange:#ff9f0a;--red:#ff453a;--violet:#bf5af2;
    --focus:rgba(64,156,255,.34);--shadow:rgba(2,3,8,.38);
  }
  *{box-sizing:border-box}
  html{background:var(--ink-0);scroll-behavior:smooth}
  body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;margin:0;background:var(--ink-0);color:var(--bone-0);font-size:13px}
  a{color:var(--teal);text-decoration:none} a:hover{text-decoration:underline}
  button,a.button{font:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:30px;padding:6px 10px;border:1px solid var(--ink-4);border-radius:6px;background:var(--ink-2);color:var(--bone-1);cursor:pointer;text-decoration:none;transition:background .18s ease,border-color .18s ease,transform .18s ease}
  button:hover,a.button:hover{background:var(--ink-3);border-color:#465063;text-decoration:none}
  a.danger{color:#ff9b95;border-color:rgba(255,69,58,.34);background:rgba(255,69,58,.09)}
  a.danger:hover{background:rgba(255,69,58,.17);border-color:rgba(255,69,58,.52)}
  button:active,a.button:active{transform:translateY(1px) scale(.99)}
  input,select{font:inherit;min-height:30px;padding:6px 9px;border:1px solid var(--ink-4);border-radius:6px;background:var(--ink-2);color:var(--bone-0);outline:none;transition:border-color .18s ease,box-shadow .18s ease}
  input:focus,select:focus,button:focus-visible,a:focus-visible{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px var(--focus)}
  input::placeholder{color:var(--bone-3)}
  table{width:100%;border-collapse:collapse;background:var(--ink-1);border:1px solid var(--ink-4)}
  th,td{border-bottom:1px solid var(--ink-4);padding:7px 8px;text-align:left;font-size:12.5px;vertical-align:middle}
  th{position:sticky;top:0;z-index:1;background:#14151d;color:var(--bone-2);font-size:10.5px;font-weight:650;text-transform:uppercase;letter-spacing:0}
  tr:hover{background:#1a1d27}
  tr.row-deleted{background:rgba(255,69,58,.16)}
  tr.row-deleted:hover{background:rgba(255,69,58,.23)}
  tr.row-deleted td{border-bottom-color:rgba(255,69,58,.3)}
  .shell{min-height:100dvh;display:grid;grid-template-columns:178px minmax(0,1fr);grid-template-rows:36px 1fr}
  .titlebar{grid-column:1 / -1;height:36px;display:flex;align-items:center;gap:10px;padding:0 12px;background:var(--ink-1);border-bottom:1px solid var(--ink-4)}
  .traffic{display:flex;gap:7px}.traffic span{width:11px;height:11px;border-radius:999px}.traffic span:nth-child(1){background:#ff5f57}.traffic span:nth-child(2){background:#febc2e}.traffic span:nth-child(3){background:#28c840}
  .brand{font-weight:700;font-size:13px}.crumb{color:var(--bone-3)}.subbrand{color:var(--bone-2);font-size:12px;white-space:nowrap}
  .spacer{flex:1}.live{display:inline-flex;align-items:center;gap:7px;color:var(--bone-2);font-family:ui-monospace,"SF Mono",monospace;font-size:11px;font-variant-numeric:tabular-nums}.live:before{content:"";width:6px;height:6px;border-radius:999px;background:var(--green);box-shadow:0 0 14px rgba(48,209,88,.7)}
  .sidebar{min-width:0;background:var(--ink-1);border-right:1px solid var(--ink-4);padding:10px 8px;overflow:auto}
  .nav-section{margin-bottom:16px}.nav-title{display:flex;align-items:center;gap:7px;padding:0 8px 6px;color:var(--bone-3);font-size:10.5px;letter-spacing:0;text-transform:uppercase}
  .nav-link{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;border-radius:6px;color:var(--bone-1);font-size:12.5px}
  .nav-link.active{background:var(--ink-2);color:var(--bone-0);box-shadow:inset 2px 0 0 var(--blue)}
  .nav-link .count,.nav-link code{font-family:ui-monospace,"SF Mono",monospace;color:var(--bone-3);font-size:11px}
  .content{min-width:0;overflow:auto;background:#0b0c11}
  .toolbar{display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--ink-4);background:rgba(16,16,23,.96);position:sticky;top:0;z-index:3;backdrop-filter:blur(12px)}
  .quick-search{display:flex;gap:8px;align-items:center;min-width:260px;flex:1}
  .quick-search input{flex:1;min-width:220px}
  .panel{padding:10px}.panel-row{display:flex;gap:8px;margin-bottom:8px;align-items:center;min-width:0}.panel-row form,.filters{display:flex;gap:8px;align-items:center;min-width:0}
  .filters{flex:1;flex-wrap:wrap}.filters input{min-width:230px;flex:1}.filters select{min-width:128px}
  .panel-row form{flex:1}.panel-row input{min-width:0}.grow{flex:1}
  .config-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;max-width:980px}
  .export-head{max-width:980px;margin-bottom:10px;padding:12px;background:var(--ink-1);border:1px solid var(--blue);border-radius:6px;box-shadow:0 0 0 3px rgba(64,156,255,.08)}
  .export-head h1{margin:0 0 6px;font-size:20px;line-height:1.2;letter-spacing:0}
  .export-head p{margin:0;color:var(--bone-2);font-size:12.5px}
  .page-intro{max-width:980px;margin-bottom:10px;padding:10px 0 12px;border-bottom:1px solid var(--ink-4)}
  .page-intro h1{margin:0 0 5px;font-size:18px;line-height:1.2;letter-spacing:0}
  .page-intro p{margin:0;color:var(--bone-2);font-size:12.5px;line-height:1.45}
  .config-title{grid-column:1 / -1;margin-top:4px;color:var(--bone-0);font-size:12px;font-weight:700;text-transform:uppercase}
  .config-field{display:flex;flex-direction:column;gap:6px;padding:10px;background:var(--ink-1);border:1px solid var(--ink-4);border-radius:6px}
  .config-field label,.checkline{color:var(--bone-1);font-size:12px}
  .checkline{display:flex;align-items:center;gap:8px;min-height:30px}
  .preview{max-width:980px;margin-top:10px;padding:12px;background:var(--ink-1);border:1px solid var(--ink-4);border-radius:6px;white-space:pre-wrap;font-family:ui-monospace,"SF Mono",monospace;font-size:11.5px;line-height:1.55;color:var(--bone-1)}
  .count{color:var(--bone-2);font-size:12px;white-space:nowrap;font-family:ui-monospace,"SF Mono",monospace;font-variant-numeric:tabular-nums}
  .lite-badge{display:inline-flex;align-items:center;min-height:22px;padding:2px 8px;border:1px solid var(--ink-4);border-radius:999px;color:var(--bone-2);font-size:11px;background:#0c0d13;white-space:nowrap}
  .lite-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:8px}
  details.lite-box{border:1px solid var(--ink-4);border-radius:6px;background:var(--ink-1);overflow:hidden}
  details.lite-box summary{cursor:pointer;list-style:none;padding:8px 10px;color:var(--bone-1);font-weight:650;font-size:12px}
  details.lite-box summary::-webkit-details-marker{display:none}
  details.lite-box summary:after{content:"+";float:right;color:var(--bone-3);font-family:ui-monospace,"SF Mono",monospace}
  details.lite-box[open] summary{border-bottom:1px solid var(--ink-4)}
  details.lite-box[open] summary:after{content:"-"}
  .lite-box-body{padding:8px 8px 0}
  .fold-panel{border:1px solid var(--ink-4);border-radius:6px;background:var(--ink-1);overflow:hidden;min-width:0}
  .fold-panel summary{cursor:pointer;list-style:none;padding:8px 10px;color:var(--bone-1);font-weight:650}
  .fold-panel summary::-webkit-details-marker{display:none}
  .fold-panel summary:after{content:"+";float:right;color:var(--bone-3);font-family:ui-monospace,"SF Mono",monospace}
  .fold-panel[open] summary{border-bottom:1px solid var(--ink-4)}
  .fold-panel[open] summary:after{content:"-"}
  .fold-body{padding:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .toolbar-stack{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;align-items:start}
  .toolbar-stack .filters{width:100%}
  .date-ref{white-space:nowrap;color:var(--bone-1);font-family:ui-monospace,"SF Mono",monospace;font-size:11.5px}
  .export-list{max-width:980px;margin-top:10px}
  .export-list table{box-shadow:none}
  .export-list th,.export-list td{font-size:12px}
  .scan-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;max-width:1180px;margin-bottom:10px}
  .scan-card{padding:10px;background:var(--ink-1);border:1px solid var(--ink-4);border-radius:6px}
  .scan-card strong{display:block;font-size:18px;color:var(--bone-0);line-height:1.2}
  .scan-card span{color:var(--bone-2);font-size:11.5px}
  .scan-excerpt{max-width:1180px;margin-top:10px}
  .scan-excerpt details{border:1px solid var(--ink-4);border-radius:6px;background:var(--ink-1);margin-bottom:8px;overflow:hidden}
  .scan-excerpt summary{cursor:pointer;padding:8px 10px;font-weight:650;color:var(--bone-1)}
  .scan-excerpt p{margin:0;padding:0 10px 10px;color:var(--bone-2);line-height:1.45}
  .scan-top{position:sticky;top:0;z-index:4;background:#0b0c11;border-bottom:1px solid var(--ink-4);padding-bottom:8px;margin-bottom:10px}
  .top-fold{position:sticky;top:0;z-index:4;background:#0b0c11;border-bottom:1px solid var(--ink-4);padding:10px;margin:-10px -10px 10px}
  .top-fold .page-intro{max-width:none}
  .top-fold .lite-actions{margin-bottom:8px}
  .top-summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .top-summary strong{color:var(--bone-0)}
  .top-summary .count{margin-left:auto}
  .scan-settings{border:1px solid var(--ink-4);border-radius:6px;background:var(--ink-1);margin-top:8px;overflow:hidden}
  .scan-settings summary{cursor:pointer;list-style:none;padding:8px 10px;color:var(--bone-1);font-weight:650}
  .scan-settings summary::-webkit-details-marker{display:none}
  .scan-settings summary:after{content:"+";float:right;color:var(--bone-3);font-family:ui-monospace,"SF Mono",monospace}
  .scan-settings[open] summary{border-bottom:1px solid var(--ink-4)}
  .scan-settings[open] summary:after{content:"-"}
  .scan-settings .config-grid{padding:10px}
  .auto-refresh{display:inline-flex;gap:6px;align-items:center;color:var(--bone-2);font-size:12px;white-space:nowrap}.auto-refresh input,.row-check,#checkAllVisible{width:auto;min-height:auto;accent-color:var(--blue)}
  .pill{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;border-radius:5px;font-size:11.5px;font-weight:650;border:1px solid transparent;white-space:nowrap}
  .source-codex{background:rgba(100,210,255,.12);color:var(--teal);border-color:rgba(100,210,255,.32)}
  .source-claude{background:rgba(255,159,10,.12);color:var(--orange);border-color:rgba(255,159,10,.32)}
  .source-gemini{background:rgba(191,90,242,.12);color:#dca7ff;border-color:rgba(191,90,242,.32)}
  .source-chatgpt{background:rgba(48,209,88,.12);color:#70df8d;border-color:rgba(48,209,88,.3)}
  .source-perplexity{background:rgba(64,156,255,.12);color:#80bdff;border-color:rgba(64,156,255,.32)}
  .project-00-inbox{background:rgba(255,159,10,.12);color:#ffc466;border-color:rgba(255,159,10,.32)}
  .project-codex{background:rgba(48,209,88,.12);color:#77df92;border-color:rgba(48,209,88,.3)}
  .project-notecortex{background:rgba(191,90,242,.12);color:#d7a2ff;border-color:rgba(191,90,242,.3)}
  .project-prompt-management{background:rgba(100,210,255,.12);color:#91e2ff;border-color:rgba(100,210,255,.32)}
  .project-nyx{background:rgba(242,242,245,.1);color:var(--bone-1);border-color:rgba(242,242,245,.22)}
  .project-grocerynanny{background:rgba(255,69,58,.12);color:#ff8e88;border-color:rgba(255,69,58,.28)}
  .project-coopro{background:rgba(64,156,255,.12);color:#82bdff;border-color:rgba(64,156,255,.3)}
  .project-centralis{background:rgba(255,159,10,.12);color:#ffc066;border-color:rgba(255,159,10,.28)}
  .project-noteplan{background:rgba(48,209,88,.1);color:#88d56f;border-color:rgba(48,209,88,.28)}
  .status-inbox{background:rgba(255,159,10,.12);color:#ffd083;border-color:rgba(255,159,10,.32)}
  .status-active{background:rgba(48,209,88,.12);color:#7ee197;border-color:rgba(48,209,88,.3)}
  .status-done{background:rgba(64,156,255,.12);color:#88c2ff;border-color:rgba(64,156,255,.3)}
  .status-deleted{background:rgba(255,69,58,.12);color:#ff8e88;border-color:rgba(255,69,58,.28)}
  .status-archived,.status-obsolete{background:rgba(146,148,156,.13);color:var(--bone-2);border-color:rgba(146,148,156,.25)}
  .status-dot{display:inline-block;width:9px;height:9px;border-radius:999px;background:var(--bone-3);box-shadow:0 0 0 3px rgba(146,148,156,.14)}
  .status-dot.active,.status-dot.done{background:var(--green);box-shadow:0 0 0 3px rgba(48,209,88,.16)}
  .status-dot.inbox,.status-dot.archived,.status-dot.obsolete{background:var(--orange);box-shadow:0 0 0 3px rgba(255,159,10,.16)}
  .status-dot.deleted{background:var(--red);box-shadow:0 0 0 3px rgba(255,69,58,.16)}
  .usage-cell{display:flex;align-items:center;gap:8px;white-space:nowrap;color:var(--bone-1)}
  tr.duplicate-parent td{border-bottom-color:#3c4050}
  tr.duplicate-child-wrap{background:#0b0c11}
  tr.duplicate-child-wrap:hover{background:#0b0c11}
  tr.duplicate-child-wrap>td{padding:0 0 8px 38px;border-bottom-color:#3c4050}
  .duplicates-fold{margin:0 8px;border:1px solid var(--ink-4);border-radius:6px;background:var(--ink-1);overflow:hidden}
  .duplicates-fold summary{cursor:pointer;list-style:none;padding:7px 9px;color:var(--bone-2);font-size:12px;font-weight:650}
  .duplicates-fold summary::-webkit-details-marker{display:none}
  .duplicates-fold summary:after{content:"+";float:right;color:var(--bone-3);font-family:ui-monospace,"SF Mono",monospace}
  .duplicates-fold[open] summary{border-bottom:1px solid var(--ink-4)}
  .duplicates-fold[open] summary:after{content:"-"}
  .duplicates-fold table{border:0;border-radius:0;background:#0f1017}
  .duplicates-fold tr:last-child td{border-bottom:0}
  .table-wrap{overflow:auto;border-radius:6px}
  @media (max-width:900px){.shell{grid-template-columns:1fr}.sidebar{display:none}.toolbar,.panel-row{flex-wrap:wrap}.toolbar-stack{grid-template-columns:1fr}.subbrand{display:none}.config-grid,.lite-actions,.scan-grid{grid-template-columns:1fr}}
  `;
}

function cockpitNav(active, counts = {}) {
  const link = (id, href, label, meta) => `<a class="nav-link${active === id ? " active" : ""}" href="${href}"><span>${label}</span>${meta}</a>`;
  return `<div class="nav-section"><div class="nav-title">Cockpit</div>
      ${link("chats", "/", "Chats", `<span class="count">${escapeHtml(counts.chats ?? "all")}</span>`)}
      ${link("scan", "/scan", "Scan full text", "<code>txt</code>")}
      ${link("prompts", "/prompts", "Prompts", `<span class="count">${escapeHtml(counts.prompts ?? "K")}</span>`)}
      ${link("export", "/export-config", "Exporter", "<code>md</code>")}
    </div>`;
}

function pageIntro(title, line1, line2) {
  return `<div class="page-intro"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(line1)}<br>${escapeHtml(line2)}</p></div>`;
}

function uiHtml(items, filters = {}, availableProjects = [], root = "") {
  const q = filters.q || "";
  let filtered = filters.status ? items : items.filter(i => i.status !== "deleted");
  if (q) filtered = filtered.filter(i => matchesItemQuery(root, i, q, filters.full_text === "1", filters.q_mode || "contains"));
  if (filters.project) filtered = filtered.filter(i => i.project === filters.project);
  if (filters.source) filtered = filtered.filter(i => i.source === filters.source);
  if (filters.status) filtered = filtered.filter(i => i.status === filters.status);
  const sortKey = filters.sort || "updated";
  const sortDir = filters.dir === "asc" ? 1 : -1;
  filtered = [...filtered].sort((a, b) => {
    const av = String(a[sortKey] || "");
    const bv = String(b[sortKey] || "");
    return av.localeCompare(bv) * sortDir || a.title.localeCompare(b.title);
  });
  const projects = availableProjects.length ? availableProjects : [...new Set(items.map(i => i.project).filter(Boolean))].sort();
  const sources = [...new Set(items.map(i => i.source).filter(Boolean))].sort();
  const statuses = [...new Set(items.map(i => i.status).filter(Boolean))].sort();
  const option = (value, selected) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
  const sortLink = (label, key) => {
    const nextDir = sortKey === key && filters.dir !== "asc" ? "asc" : "desc";
    const params = new URLSearchParams({ ...filters, sort: key, dir: nextDir });
    for (const [k, v] of [...params.entries()]) if (!v) params.delete(k);
    return `<a href="/?${params.toString()}">${label}</a>`;
  };
  const projectClass = project => `project-${slug(project).toLowerCase()}`;
  const filteredIds = JSON.stringify(filtered.map(item => item.id));
  const chatRow = (i, extraClass = "") => `<tr class="${extraClass}${extraClass ? " " : ""}row-${slug(i.status).toLowerCase()}">
    <td><input class="row-check" type="checkbox" name="ids" value="${i.id}"></td>
    <td><span class="date-ref" title="${escapeHtml(i.updated || i.created || "")}">${escapeHtml(shortDate(i.updated || i.created))}</span></td>
    <td><span class="pill source-${escapeHtml(i.source)}">${escapeHtml(i.source)}</span></td>
    <td><a href="/chat?id=${i.id}">${escapeHtml(i.title)}</a></td>
    <td><span class="pill ${projectClass(i.project)}">${escapeHtml(i.project)}</span></td>
    <td><span class="pill status-${escapeHtml(i.status)}">${escapeHtml(i.status)}</span></td>
    <td><a href="/chat?id=${encodeURIComponent(i.id)}">Chat</a></td>
    <td>${i.source_url ? `<a href="${escapeHtml(i.source_url)}" target="_blank" rel="noopener">Source</a>` : ""}</td>
    <td><a href="/archive?ids=${encodeURIComponent(i.id)}">Archive</a></td>
    <td><a class="danger" data-confirm-delete href="/delete?ids=${encodeURIComponent(i.id)}">Delete</a></td>
  </tr>`;
  const rows = groupedDuplicateRows(filtered).map(group => {
    const parent = chatRow(group.parent, group.duplicates.length ? "duplicate-parent" : "");
    if (!group.duplicates.length) return parent;
    const duplicateRows = group.duplicates.map(i => chatRow(i)).join("");
    return `${parent}<tr class="duplicate-child-wrap"><td colspan="10">
      <details class="duplicates-fold">
        <summary>Doublons (${group.duplicates.length}) sous ${escapeHtml(group.parent.title)}</summary>
        <table><tbody>${duplicateRows}</tbody></table>
      </details>
    </td></tr>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Prompt Vault</title>
  <style>${vaultCss()}</style>
  <script>
  function setupAutoRefresh(){
    const box=document.getElementById('autoRefresh');
    if(!box) return;
    box.checked=localStorage.getItem('pv:autoRefresh')==='1';
    box.addEventListener('change',()=>localStorage.setItem('pv:autoRefresh',box.checked?'1':'0'));
    setInterval(()=>{ if(localStorage.getItem('pv:autoRefresh')==='1') window.location.reload(); },15000);
  }
  function selectedIds(){
    try { return new Set(JSON.parse(localStorage.getItem('pv:selected')||'[]')); }
    catch { return new Set(); }
  }
  function saveSelected(ids){ localStorage.setItem('pv:selected', JSON.stringify([...ids])); }
  const PV_FILTER_COOKIE='pv_filters_v1';
  const PV_FILTER_KEYS=['q','q_mode','project','source','status','full_text','sort','dir'];
  function setCookie(name,value){
    document.cookie=name+'='+encodeURIComponent(value)+'; max-age=31536000; path=/; SameSite=Lax';
  }
  function getCookie(name){
    return document.cookie.split('; ').find(row=>row.startsWith(name+'='))?.split('=')[1] || '';
  }
  function filterState(){
    const form=document.getElementById('filterForm');
    const state={version:1,saved_at:new Date().toISOString(),filters:{}};
    if(!form) return state;
    for(const key of PV_FILTER_KEYS){
      const field=form.elements[key];
      if(!field) continue;
      if(field.type==='checkbox') state.filters[key]=field.checked ? field.value : '';
      else state.filters[key]=field.value || '';
    }
    return state;
  }
  function applyFilterState(state){
    const form=document.getElementById('filterForm');
    if(!form || !state || !state.filters) return;
    for(const key of PV_FILTER_KEYS){
      const field=form.elements[key];
      if(!field || state.filters[key] == null) continue;
      if(field.type==='checkbox') field.checked=String(state.filters[key])==='1';
      else field.value=String(state.filters[key]);
    }
  }
  function saveFiltersCookie(){
    setCookie(PV_FILTER_COOKIE, JSON.stringify(filterState()));
    const badge=document.getElementById('filterSaveState');
    if(badge) badge.textContent='cookie sauvé';
  }
  function loadFiltersCookie(){
    const raw=getCookie(PV_FILTER_COOKIE);
    if(!raw) return;
    try {
      applyFilterState(JSON.parse(decodeURIComponent(raw)));
      const badge=document.getElementById('filterSaveState');
      if(badge) badge.textContent='cookie chargé';
    } catch {}
  }
  function downloadFiltersJson(){
    const blob=new Blob([JSON.stringify(filterState(), null, 2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='promptvault-filtres.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function importFiltersJson(file){
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      try {
        applyFilterState(JSON.parse(String(reader.result || '{}')));
        saveFiltersCookie();
      } catch {
        alert('JSON filtre invalide');
      }
    };
    reader.readAsText(file);
  }
  function updateSelectionUi(){
    const ids=selectedIds();
    document.querySelectorAll('.row-check').forEach(box=>{ box.checked=ids.has(box.value); });
    const count=document.getElementById('selectedCount');
    if(count) count.textContent=ids.size+' selected';
    const exportLink=document.getElementById('exportSelected');
    if(exportLink) exportLink.href=ids.size ? '/export-config?ids='+encodeURIComponent([...ids].join(',')) : '/export-config';
    const archiveLink=document.getElementById('archiveSelected');
    if(archiveLink) archiveLink.href=ids.size ? '/archive?ids='+encodeURIComponent([...ids].join(',')) : '#';
    const deleteLink=document.getElementById('deleteSelected');
    if(deleteLink) deleteLink.href=ids.size ? '/delete?ids='+encodeURIComponent([...ids].join(',')) : '#';
    if(deleteLink) deleteLink.dataset.count=String(ids.size);
    const head=document.getElementById('checkAllVisible');
    const boxes=[...document.querySelectorAll('.row-check')];
    if(head){ head.checked=boxes.length>0 && boxes.every(box=>ids.has(box.value)); head.indeterminate=boxes.some(box=>ids.has(box.value)) && !head.checked; }
  }
  function setupSelection(){
    document.querySelectorAll('.row-check').forEach(box=>{
      box.addEventListener('change',()=>{
        const ids=selectedIds();
        if(box.checked) ids.add(box.value); else ids.delete(box.value);
        saveSelected(ids); updateSelectionUi();
      });
    });
    const head=document.getElementById('checkAllVisible');
    if(head) head.addEventListener('change',()=>{
      const ids=selectedIds();
      document.querySelectorAll('.row-check').forEach(box=>{ if(head.checked) ids.add(box.value); else ids.delete(box.value); });
      saveSelected(ids); updateSelectionUi();
    });
    const assign=document.getElementById('assignForm');
    if(assign) assign.addEventListener('submit',()=>{
      const ids=[...selectedIds()];
      if(ids.length) document.getElementById('selectedIds').value=ids.join(',');
    });
    updateSelectionUi();
  }
  function setupDeleteConfirm(){
    document.querySelectorAll('[data-confirm-delete]').forEach(link=>{
      link.addEventListener('click',event=>{
        if(link.getAttribute('href')==='#'){
          event.preventDefault();
          return;
        }
        const count=link.dataset.count && link.dataset.count !== '0' ? link.dataset.count : '1';
        if(!window.confirm('Confirmer suppression de '+count+' chat(s) ? Action reversible vers 98_TRASH.')){
          event.preventDefault();
        }
      });
    });
  }
  function selectVisible(){
    const ids=selectedIds();
    document.querySelectorAll('tbody .row-check').forEach(box=>ids.add(box.value));
    saveSelected(ids); updateSelectionUi();
  }
  function selectFiltered(){
    const ids=selectedIds();
    for(const id of ${filteredIds}) ids.add(id);
    saveSelected(ids); updateSelectionUi();
  }
  function deselectVisible(){
    const ids=selectedIds();
    document.querySelectorAll('tbody .row-check').forEach(box=>ids.delete(box.value));
    saveSelected(ids); updateSelectionUi();
  }
  function clearSelection(){ saveSelected(new Set()); updateSelectionUi(); }
  function setupFilterTools(){
    const file=document.getElementById('filterJsonFile');
    if(file) file.addEventListener('change',()=>importFiltersJson(file.files && file.files[0]));
  }
  window.addEventListener('DOMContentLoaded',()=>{setupAutoRefresh(); setupSelection(); setupDeleteConfirm(); setupFilterTools();});
  </script></head><body><div class="shell">
  <header class="titlebar">
    <div class="traffic"><span></span><span></span><span></span></div>
    <div class="brand">Prompt Vault</div><div class="crumb">/</div><div class="subbrand">mode leger</div>
    <div class="spacer"></div><span class="live">${new Date().toISOString().slice(11, 16)} UTC</span>
  </header>
  <aside class="sidebar">
    ${cockpitNav("chats", { chats: items.length })}
    <div class="nav-section"><div class="nav-title">Sources</div>
      ${sources.map(s => `<a class="nav-link" href="/?source=${encodeURIComponent(s)}"><span>${escapeHtml(s)}</span><span class="count">${items.filter(i => i.source === s).length}</span></a>`).join("")}
    </div>
    <div class="nav-section"><div class="nav-title">Statuts</div>
      ${statuses.map(s => `<a class="nav-link" href="/?status=${encodeURIComponent(s)}"><span>${escapeHtml(s)}</span><span class="count">${items.filter(i => i.status === s).length}</span></a>`).join("")}
    </div>
  </aside>
  <main class="content"><div class="panel">
  <details class="top-fold fold-panel">
  <summary><span class="top-summary"><strong>Chats</strong><span class="count">${filtered.length}/${items.length}</span><span>Filtres / actions / navigation</span></span></summary>
  <div class="fold-body">
    <form id="filterForm" class="filters" method="get" action="/">
      <input name="q" value="${escapeHtml(q)}" placeholder="Search">
      <select name="q_mode">
        <option value="contains"${(filters.q_mode || "contains") === "contains" ? " selected" : ""}>Contient</option>
        <option value="and"${filters.q_mode === "and" ? " selected" : ""}>AND</option>
        <option value="or"${filters.q_mode === "or" ? " selected" : ""}>OR</option>
        <option value="boolean"${filters.q_mode === "boolean" ? " selected" : ""}>Booléen</option>
      </select>
      <select name="project"><option value="">All projects</option>${projects.map(p => option(p, filters.project)).join("")}</select>
      <select name="source"><option value="">All LLMs</option>${sources.map(s => option(s, filters.source)).join("")}</select>
      <select name="status"><option value="">All status</option>${statuses.map(s => option(s, filters.status)).join("")}</select>
      <label class="auto-refresh"><input type="checkbox" name="full_text" value="1"${filters.full_text === "1" ? " checked" : ""}> Full text</label>
      <input type="hidden" name="sort" value="${escapeHtml(sortKey)}">
      <input type="hidden" name="dir" value="${escapeHtml(filters.dir || "desc")}">
      <button>Filter</button>
      <a href="/">Reset</a>
    </form>
    <span class="lite-badge">leger</span>
    <a class="button" href="/prompts">Prompts</a>
    <a class="button" href="/scan">Scan</a>
    <label class="auto-refresh"><input id="autoRefresh" type="checkbox"> Auto 15s</label>
    <a class="button" href="/export-config">Exporter</a>
    <a class="button" href="/export">Tout exporter</a>
    ${pageIntro("Chats", "Liste tous les chats importés par projet, LLM, statut et date.", "Filtre, cherche en index ou en texte complet, puis sélectionne pour assigner, archiver, supprimer ou exporter.")}
    <div class="lite-actions">
    <details class="lite-box"><summary>Imports</summary><div class="lite-box-body">
      <div class="panel-row">
        <a class="button" href="/import?source=codex&from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}">Import today</a>
        <a class="button" href="/import?source=all">Import all</a>
      </div>
      <form class="panel-row" method="get" action="/import">
        <select name="source"><option value="chatgpt">chatgpt</option><option value="perplexity">perplexity</option></select>
        <input class="grow" name="file" placeholder="/path/to/export.json or .md">
        <button>Import file</button>
      </form>
    </div></details>
    <details class="lite-box"><summary>Projets</summary><div class="lite-box-body">
      <div class="panel-row">
        <form method="post" action="/project/create">
          <input class="grow" name="project" placeholder="New project or Parent/Child">
          <button>Create project</button>
        </form>
      </div>
      <div class="panel-row">
        <form method="post" action="/project/rename">
          <input class="grow" name="from" placeholder="Rename from">
          <input class="grow" name="to" placeholder="Rename to">
          <button>Rename project</button>
        </form>
      </div>
    </div></details>
    <details class="lite-box"><summary>Filtres sauvegardés</summary><div class="lite-box-body">
      <div class="panel-row">
        <button type="button" onclick="saveFiltersCookie()">Sauver cookie</button>
        <button type="button" onclick="loadFiltersCookie()">Charger cookie</button>
        <button type="button" onclick="downloadFiltersJson()">Exporter JSON</button>
        <input id="filterJsonFile" type="file" accept="application/json,.json">
        <span id="filterSaveState" class="count">non sauvé</span>
      </div>
    </div></details>
    </div>
    <form id="assignForm" method="post" action="/assign"><input id="selectedIds" type="hidden" name="selected_ids">
    <button type="button" onclick="selectVisible()">Select visible</button>
    <button type="button" onclick="selectFiltered()">Tout sélectionner filtrés</button>
    <button type="button" onclick="deselectVisible()">Deselect visible</button>
    <button type="button" onclick="clearSelection()">Clear selection</button>
    <a class="button" id="exportSelected" href="/export-config">Exporter sélection</a>
    <a class="button" id="archiveSelected" href="#">Archive selected</a>
    <a class="button danger" id="deleteSelected" data-confirm-delete href="#">Delete selected</a>
    <span id="selectedCount" class="count">0 selected</span>
    <input class="grow" name="project" placeholder="Project"><button>Assign project</button>
    </form>
  </div></details>
  <div class="table-wrap"><table><thead><tr><th><input id="checkAllVisible" type="checkbox"></th><th>${sortLink("Date", "updated")}</th><th>${sortLink("LLM", "source")}</th><th>${sortLink("Title", "title")}</th><th>${sortLink("Project", "project")}</th><th>${sortLink("Status", "status")}</th><th>Chat</th><th>Source</th><th>Archive</th><th>Delete</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div></main></div></body></html>`;
}

function promptViewHtml(item, markdown) {
  const metadata = (markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/) || [])[1] || "";
  let body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const prefix = "\n# Objectif\n\n# Prompt\n\n";
  const suffix = "\n\n# Contexte requis\n\n# Résultat attendu\n\n# Notes\n";
  // Remove only our exact empty wrapper; never strip headings inside the user's prompt.
  if (body.startsWith(prefix) && body.endsWith(suffix)) body = body.slice(prefix.length, -suffix.length);
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(item.title)}</title><style>${vaultCss()}body{padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 monospace}details{margin:16px 0}h1{font-size:20px}</style><a href="/prompts">← Prompts</a><h1>${escapeHtml(item.title)}</h1><p>Prompt individuel · ${escapeHtml(item.id)}</p><a href="/chat?id=${encodeURIComponent(item.origin_chat)}">Chat source</a> · <a href="/prompt?id=${encodeURIComponent(item.id)}">Markdown original avec métadonnées</a><details><summary>Métadonnées et horodatage</summary><pre>${escapeHtml(metadata)}</pre></details><pre id="prompt-body">${escapeHtml(body)}</pre></html>`;
}

function promptSelectionScript() {
  const storageKey = "pv:selected-prompts";
  let selected = new Set();
  try { const ids = JSON.parse(sessionStorage.getItem(storageKey) || "[]"); if (Array.isArray(ids)) selected = new Set(ids.filter(id => typeof id === "string")); } catch {}
  const checks = [...document.querySelectorAll(".prompt-check")];
  const all = document.getElementById("selectAllPrompts");
  const count = document.getElementById("promptSelectionCount");
  const exportButton = document.getElementById("exportPromptSelection");
  const error = document.getElementById("promptSelectionError");
  let busy = false;
  function render() {
    for (const check of checks) check.checked = selected.has(check.value);
    const visible = checks.filter(check => check.checked).length;
    all.checked = checks.length > 0 && visible === checks.length;
    all.indeterminate = visible > 0 && visible < checks.length;
    all.disabled = checks.length === 0;
    count.textContent = selected.size + " sélectionné(s), dont " + visible + " visible(s)";
    exportButton.disabled = busy || selected.size === 0;
    try { sessionStorage.setItem(storageKey, JSON.stringify([...selected])); } catch {}
  }
  for (const check of checks) check.addEventListener("change", () => { if (check.checked) selected.add(check.value); else selected.delete(check.value); render(); });
  all.addEventListener("change", () => { for (const check of checks) { if (all.checked) selected.add(check.value); else selected.delete(check.value); } render(); });
  document.getElementById("clearPromptSelection").addEventListener("click", () => { selected.clear(); render(); });
  exportButton.addEventListener("click", async () => {
    if (busy || !selected.size) return;
    busy = true; error.textContent = ""; render();
    try {
      const parts = [];
      for (const id of [...selected]) {
        const response = await fetch("/prompt?id=" + encodeURIComponent(id));
        if (!response.ok) throw new Error("Prompt indisponible : " + id);
        parts.push(await response.text());
      }
      const url = URL.createObjectURL(new Blob([parts.join("\n\n---\n\n")], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "prompts-selection.md";
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) { error.textContent = "Export impossible. " + err.message; }
    finally { busy = false; render(); }
  });
  render();
}

function promptsHtml(items, params = {}) {
  const q = params.q || "";
  const sources = [...new Set(items.map(i => i.source).filter(Boolean))].sort();
  const projects = [...new Set(items.map(i => i.project).filter(Boolean))].sort();
  let filtered = q ? items.filter(i => JSON.stringify(i).toLowerCase().includes(q.toLowerCase())) : items;
  if (params.source) filtered = filtered.filter(i => i.source === params.source);
  if (params.project) filtered = filtered.filter(i => i.project === params.project);
  const option = (value, selected) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
  const rows = filtered.map(i => {
    const promptLabel = !isNoisyPromptTitle(i.title)
      ? i.title
      : `Prompt ${i.source || "LLM"} / ${i.project || "Projet"} · ${i.kchars}K`;
    const chatLabel = !isNoisyPromptTitle(i.chat_title) ? i.chat_title : "Chat source";
    const chatHref = i.chat_url || `/chat?id=${encodeURIComponent(i.origin_chat)}`;
    const externalAttrs = i.chat_url ? ` target="_blank" rel="noopener"` : "";
    return `<tr>
    <td><input class="prompt-check" type="checkbox" value="${escapeHtml(i.id)}" aria-label="Sélectionner ${escapeHtml(promptLabel)}"></td>
    <td><a title="${escapeHtml(`${i.origin_chat} · ${i.chat_url || "lien local"}`)}" href="${escapeHtml(chatHref)}"${externalAttrs}>${escapeHtml(chatLabel || i.origin_chat)}</a></td>
    <td title="${escapeHtml(`${i.id} · ${i.title || ""}`)}"><a href="/prompt-view?id=${encodeURIComponent(i.id)}">${escapeHtml(promptLabel)}</a></td>
    <td><span class="pill source-${escapeHtml(i.source)}">${escapeHtml(i.source || "unknown")}</span></td>
    <td>${escapeHtml(i.project)}</td>
    <td>${escapeHtml(i.kchars)}K</td>
    <td><span class="usage-cell" title="${escapeHtml(`${i.status || "unknown"} · ${i.chat_updated || ""}`)}"><span class="status-dot ${escapeHtml(i.status || "")}"></span><span class="date-ref">${escapeHtml(shortDate(i.chat_updated))}</span></span></td>
  </tr>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Prompt Vault Prompts</title>
  <style>${vaultCss()}</style></head><body><div class="shell">
  <header class="titlebar">
    <div class="traffic"><span></span><span></span><span></span></div>
    <div class="brand">Prompt Vault</div><div class="crumb">/</div><div class="subbrand">Prompts</div>
    <div class="spacer"></div><span class="live">${new Date().toISOString().slice(11, 16)} UTC</span>
  </header>
  <aside class="sidebar">
    ${cockpitNav("prompts", { prompts: items.length })}
    <div class="nav-section"><div class="nav-title">Sources prompts</div>
      ${sources.map(s => `<a class="nav-link" href="/prompts?source=${encodeURIComponent(s)}"><span>${escapeHtml(s)}</span><span class="count">${items.filter(i => i.source === s).length}</span></a>`).join("")}
    </div>
    <div class="nav-section"><div class="nav-title">Tailles</div>
      <div class="nav-link"><span>Unité</span><code>1K=1000</code></div>
      <div class="nav-link"><span>Mesure</span><code>chars</code></div>
    </div>
  </aside>
  <main class="content"><div class="toolbar toolbar-stack">
  <details class="fold-panel"><summary>Filtres prompts</summary><div class="fold-body">
    <a class="button" href="/">Chats</a>
    <form class="filters" method="get" action="/prompts">
      <input name="q" value="${escapeHtml(q)}" placeholder="Search prompts">
      <select name="source"><option value="">All LLMs</option>${sources.map(s => option(s, params.source)).join("")}</select>
      <select name="project"><option value="">All projects</option>${projects.map(p => option(p, params.project)).join("")}</select>
      <button>Search</button>
    </form>
    <span class="count">${filtered.length}/${items.length}</span>
  </div></details>
  </div><div class="panel">
  <div class="top-fold">
  ${pageIntro("Prompts", "Isole les demandes réutilisables extraites des conversations.", "Sert à repérer les prompts courts ou longs par projet, taille en K caractères, statut et chat d’origine.")}
  </div>
  <div class="toolbar"><label><input id="selectAllPrompts" type="checkbox"> Tout sélectionner (résultats visibles)</label><span id="promptSelectionCount" role="status"></span><button id="clearPromptSelection" type="button">Désélectionner</button><button id="exportPromptSelection" type="button">Exporter la sélection .md</button><span id="promptSelectionError" role="alert"></span></div>
  <div class="table-wrap"><table><thead><tr><th>Sélection</th><th>Chat</th><th>Prompt</th><th>LLM</th><th>Project</th><th>K chars</th><th>Dernier usage</th></tr></thead><tbody>${rows}</tbody></table></div></div></main></div><script>(${promptSelectionScript.toString()})();</script></body></html>`;
}

function exportConfigHtml(root, items, params = {}) {
  const projects = projectNames(root, items);
  const sources = [...new Set(items.map(i => i.source).filter(Boolean))].sort();
  const statuses = [...new Set(items.map(i => i.status).filter(Boolean))].sort();
  const option = (value, selected) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
  const selectedItems = exportItems(items, params, root);
  const download = new URLSearchParams();
  for (const key of ["ids", "q", "q_mode", "full_text", "project", "source", "status", "include_deleted", "global_frontmatter", "keep_frontmatter", "keep_raw"]) {
    if (params[key]) download.set(key, params[key]);
  }
  const preview = exportMarkdown(root, selectedItems.slice(0, 3), { ...params, global_frontmatter: "1" }).slice(0, 5000);
  const selectedRows = selectedItems.slice(0, 80).map(i => `<tr>
    <td><span class="date-ref" title="${escapeHtml(i.updated || i.created || "")}">${escapeHtml(shortDate(i.updated || i.created))}</span></td>
    <td><span class="pill source-${escapeHtml(i.source)}">${escapeHtml(i.source)}</span></td>
    <td><span class="pill project-${slug(i.project).toLowerCase()}">${escapeHtml(i.project)}</span></td>
    <td><a href="/chat?id=${encodeURIComponent(i.id)}">${escapeHtml(i.title)}</a></td>
    <td><span class="pill status-${escapeHtml(i.status)}">${escapeHtml(i.status)}</span></td>
  </tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Prompt Vault Exporter</title>
  <style>${vaultCss()}</style>
  <script>
  function selectedIds(){
    try { return JSON.parse(localStorage.getItem('pv:selected')||'[]'); }
    catch { return []; }
  }
  function setupExportForm(){
    const form=document.getElementById('exportConfigForm');
    if(!form) return;
    const ids=document.getElementById('exportIds');
    const count=document.getElementById('selectedBrowserCount');
    const current=selectedIds();
    if(ids && !ids.value) ids.value=current.join(',');
    if(count) count.textContent=current.length+' selected in browser';
  }
  window.addEventListener('DOMContentLoaded',setupExportForm);
  </script></head><body><div class="shell">
  <header class="titlebar">
    <div class="traffic"><span></span><span></span><span></span></div>
    <div class="brand">Prompt Vault</div><div class="crumb">/</div><div class="subbrand">Exporter</div>
    <div class="spacer"></div><span class="live">${new Date().toISOString().slice(11, 16)} UTC</span>
  </header>
  <aside class="sidebar">
    ${cockpitNav("export", { chats: items.length })}
    <div class="nav-section"><div class="nav-title">Preview</div>
      <div class="nav-link"><span>Items</span><span class="count">${selectedItems.length}</span></div>
      <div class="nav-link"><span>Front matter</span><code>${params.global_frontmatter === "1" ? "on" : "off"}</code></div>
    </div>
  </aside>
  <main class="content"><div class="toolbar">
    <details class="fold-panel"><summary>Navigation export</summary><div class="fold-body">
      <a class="button" href="/">Chats</a>
      <a class="button" href="/prompts">Prompts</a>
      <span class="count">Exporter: ${selectedItems.length}/${items.length}</span>
    </div></details>
  </div>
  <div class="panel">
    <div class="top-fold">
    ${pageIntro("Exporter", "Prépare un fichier Markdown depuis une sélection ou des filtres.", "Choisis projet, LLM, statut, recherche full text et front matter avant de télécharger le .md.")}
    <form id="exportConfigForm" method="get" action="/export-config">
      <input id="exportIds" type="hidden" name="ids" value="${escapeHtml(params.ids || "")}">
      <details class="fold-panel"><summary>Réglages export</summary><div class="config-grid fold-body">
        <div class="config-title">Options du fichier .md</div>
        <div class="config-field">
          <label>Contenu</label>
          <input type="hidden" name="global_frontmatter" value="0"><label class="checkline"><input type="checkbox" name="global_frontmatter" value="1"${params.global_frontmatter === "1" ? " checked" : ""}> Ajouter un front matter global d'export</label>
          <input type="hidden" name="keep_frontmatter" value="0"><label class="checkline"><input type="checkbox" name="keep_frontmatter" value="1"${params.keep_frontmatter !== "0" ? " checked" : ""}> Garder le front matter de chaque chat</label>
          <input type="hidden" name="keep_raw" value="0"><label class="checkline"><input type="checkbox" name="keep_raw" value="1"${params.keep_raw !== "0" ? " checked" : ""}> Garder les liens RAW</label>
          <input type="hidden" name="include_deleted" value="0"><label class="checkline"><input type="checkbox" name="include_deleted" value="1"${params.include_deleted === "1" ? " checked" : ""}> Inclure les supprimés si aucun statut n'est filtré</label>
        </div>
        <div class="config-field"><label>Sélection</label><span id="selectedBrowserCount" class="count">0 sélectionné dans le navigateur</span><span class="count">${params.ids ? String(params.ids).split(",").filter(Boolean).length : 0} sélectionné dans l'URL</span><span class="count">${selectedItems.length} chats exportables</span></div>
        <div class="config-title">Filtres d'export</div>
        <div class="config-field"><label>Recherche</label><input name="q" value="${escapeHtml(params.q || "")}" placeholder="Filtrer par texte"><select name="q_mode"><option value="contains"${(params.q_mode || "contains") === "contains" ? " selected" : ""}>Contient</option><option value="and"${params.q_mode === "and" ? " selected" : ""}>AND</option><option value="or"${params.q_mode === "or" ? " selected" : ""}>OR</option><option value="boolean"${params.q_mode === "boolean" ? " selected" : ""}>Booléen</option></select><label class="checkline"><input type="checkbox" name="full_text" value="1"${params.full_text === "1" ? " checked" : ""}> Chercher dans le texte complet des chats</label></div>
        <div class="config-field"><label>Projet</label><select name="project"><option value="">Tous les projets</option>${projects.map(p => option(p, params.project)).join("")}</select></div>
        <div class="config-field"><label>LLM / source</label><select name="source"><option value="">Tous les LLM</option>${sources.map(s => option(s, params.source)).join("")}</select></div>
        <div class="config-field"><label>Statut</label><select name="status"><option value="">Visibles seulement</option>${statuses.map(s => option(s, params.status)).join("")}</select></div>
      </div></details>
      <details class="fold-panel" style="margin-top:10px"><summary>Actions export</summary><div class="fold-body">
        <button>Prévisualiser</button>
        <button formaction="/export">Télécharger .md</button>
        <a class="button" href="/export">Tout exporter</a>
      </div></details>
    </form>
    </div>
    <div class="export-list table-wrap"><table><thead><tr><th>Date</th><th>LLM</th><th>Projet</th><th>Chat exporté</th><th>Statut</th></tr></thead><tbody>${selectedRows || '<tr><td colspan="5">Aucun chat dans ce périmètre.</td></tr>'}</tbody></table></div>
    <pre class="preview">${escapeHtml(preview || "No item for this export config.")}</pre>
  </div></main></div></body></html>`;
}

function scanHtml(root, params = {}) {
  const items = loadIndex(root);
  const projects = projectNames(root, items);
  const sources = [...new Set(items.map(i => i.source).filter(Boolean))].sort();
  const report = deepScan(root, params);
  const currentQuery = new URLSearchParams(params).toString();
  const selectedExportBase = JSON.stringify(`/scan-export?${currentQuery ? `${currentQuery}&` : ""}ids=`);
  const selectedZipBase = JSON.stringify(`/scan-export.zip?${currentQuery ? `${currentQuery}&` : ""}ids=`);
  const allScanIds = JSON.stringify(report.files.map(item => `${item.kind}:${item.id}`));
  const option = (value, selected) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
  const sortLink = (label, key) => {
    const nextDir = params.sort === key && params.dir !== "asc" ? "asc" : "desc";
    const next = new URLSearchParams({ ...params, sort: key, dir: nextDir });
    for (const [k, v] of [...next.entries()]) if (!v) next.delete(k);
    const mark = params.sort === key ? (params.dir === "asc" ? " ↑" : " ↓") : "";
    return `<a href="/scan?${escapeHtml(next.toString())}">${escapeHtml(label)}${mark}</a>`;
  };
  const keywords = report.keywords_report.map(row => `<tr>
    <td>${escapeHtml(row.keyword)}</td>
    <td>${row.occurrences}</td>
    <td>${row.files}</td>
  </tr>`).join("");
  const sortedFiles = sortedScanFiles(report.files, params);
  const files = sortedFiles.slice(0, 80).map(item => {
    const rowId = `${item.kind}:${item.id}`;
    return `<tr>
    <td><input class="scan-check" type="checkbox" value="${escapeHtml(rowId)}" aria-label="Sélectionner ${escapeHtml(item.title)}"></td>
    <td><span class="date-ref" title="${escapeHtml(item.updated || item.created || "")}">${escapeHtml(shortDate(item.updated || item.created))}</span></td>
    <td>${item.total}</td>
    <td>${escapeHtml(item.kind)}</td>
    <td><span class="pill source-${escapeHtml(item.source)}">${escapeHtml(item.source)}</span></td>
    <td><span class="pill project-${slug(item.project).toLowerCase()}">${escapeHtml(item.project)}</span></td>
    <td><a href="${item.kind === "chat" ? `/chat?id=${encodeURIComponent(item.id)}` : `/prompt?id=${encodeURIComponent(item.id)}`}">${escapeHtml(item.title)}</a></td>
  </tr>`;
  }).join("");
  const excerpts = report.keywords_report
    .filter(row => row.occurrences > 0)
    .map(row => `<details><summary>${escapeHtml(row.keyword)} · ${row.occurrences} occurrence(s) · ${row.files} fichier(s)</summary>${row.matches.map(match => `<p><strong>${escapeHtml(match.project || "(vide)")} / ${escapeHtml(match.source)} / ${escapeHtml(match.kind)}</strong><br>${escapeHtml(match.title)}<br><code>${escapeHtml(match.path)}</code><br>${escapeHtml(match.excerpt)}</p>`).join("")}</details>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Prompt Vault Scan</title>
  <style>${vaultCss()}</style>
  <script>
  function scanSelectedIds(){
    try { return new Set(JSON.parse(localStorage.getItem('pv:scanSelected')||'[]')); }
    catch { return new Set(); }
  }
  function saveScanSelectedIds(ids){
    localStorage.setItem('pv:scanSelected', JSON.stringify([...ids]));
  }
  function updateScanSelection(){
    const ids=scanSelectedIds();
    document.querySelectorAll('.scan-check').forEach(input => { input.checked=ids.has(input.value); });
    const count=document.getElementById('scanSelectedCount');
    if(count) count.textContent=ids.size+' / ${report.matched_files} sélectionné(s)';
    const link=document.getElementById('scanExportSelected');
    const zip=document.getElementById('scanZipSelected');
    const base=${selectedExportBase};
    const zipBase=${selectedZipBase};
    if(link) link.href=ids.size ? base+encodeURIComponent([...ids].join(',')) : base;
    if(zip) zip.href=ids.size ? zipBase+encodeURIComponent([...ids].join(',')) : zipBase;
  }
  function selectVisibleScan(){
    const ids=scanSelectedIds();
    document.querySelectorAll('.scan-check').forEach(input => ids.add(input.value));
    saveScanSelectedIds(ids);
    updateScanSelection();
  }
  function selectAllScan(){
    const ids=scanSelectedIds();
    for(const id of ${allScanIds}) ids.add(id);
    saveScanSelectedIds(ids);
    updateScanSelection();
  }
  function clearAllScan(){
    saveScanSelectedIds(new Set());
    updateScanSelection();
  }
  function clearVisibleScan(){
    const ids=scanSelectedIds();
    document.querySelectorAll('.scan-check').forEach(input => ids.delete(input.value));
    saveScanSelectedIds(ids);
    updateScanSelection();
  }
  window.addEventListener('DOMContentLoaded',() => {
    document.querySelectorAll('.scan-check').forEach(input => {
      input.addEventListener('change',() => {
        const ids=scanSelectedIds();
        if(input.checked) ids.add(input.value); else ids.delete(input.value);
        saveScanSelectedIds(ids);
        updateScanSelection();
      });
    });
    updateScanSelection();
  });
  </script></head><body><div class="shell">
  <header class="titlebar">
    <div class="traffic"><span></span><span></span><span></span></div>
    <div class="brand">Prompt Vault</div><div class="crumb">/</div><div class="subbrand">Full text scan</div>
    <div class="spacer"></div><span class="live">${new Date().toISOString().slice(11, 16)} UTC</span>
  </header>
  <aside class="sidebar">
    ${cockpitNav("scan", { chats: items.length })}
  </aside>
  <main class="content"><div class="toolbar">
    <form class="quick-search" method="get" action="/scan">
      <input name="keywords" value="${escapeHtml(params.keywords || "")}" placeholder='Search full text: Nyx AND (NotePlan OR NoteCortex)'>
      <input type="hidden" name="scope" value="${escapeHtml(params.scope || "all")}">
      <button>Scanner</button>
    </form>
    <a class="button" href="/">Chats</a>
    <a class="button" href="/export-config">Exporter</a>
    <span class="count">${report.matched_files}/${report.scanned_files} fichiers</span>
  </div>
  <div class="panel">
    <div class="scan-top top-fold">
      ${pageIntro("Scan full text", "Cherche dans le texte complet des Markdown de chats et de prompts.", "Accepte mots-clés et booléen: AND, OR, NOT, guillemets, parenthèses; RAW reste intact.")}
      <details class="scan-settings">
        <summary>Réglages scan</summary>
        <form class="config-grid" method="get" action="/scan">
          <div class="config-field"><label>Mots-clés / booléen</label><input name="keywords" value="${escapeHtml(params.keywords || "")}" placeholder='Nyx AND (NotePlan OR NoteCortex) NOT archive'></div>
          <div class="config-field"><label>Scope</label><select name="scope">${["all", "chats", "prompts"].map(v => option(v, params.scope || "all")).join("")}</select></div>
          <div class="config-field"><label>Projet</label><select name="project"><option value="">Tous</option>${projects.map(p => option(p, params.project)).join("")}</select></div>
          <div class="config-field"><label>Source</label><select name="source"><option value="">Toutes</option>${sources.map(s => option(s, params.source)).join("")}</select></div>
          <div class="config-field"><label>Statut</label><select name="status"><option value="">Visibles</option>${[...new Set(items.map(i => i.status).filter(Boolean))].sort().map(s => option(s, params.status)).join("")}</select></div>
          <div class="config-field"><label>Extraits par mot-clé</label><input name="max" value="${escapeHtml(params.max || "12")}"></div>
          <div class="config-field"><label>Contexte caractères</label><input name="context" value="${escapeHtml(params.context || "120")}"></div>
          <div class="config-field"><label>Sortie rapport</label><a class="button" href="/scan.json?${escapeHtml(currentQuery)}">JSON</a></div>
          <div class="panel-row" style="grid-column:1 / -1"><button>Scanner</button></div>
        </form>
      </details>
      <details class="fold-panel" style="margin-top:10px"><summary>Actions scan</summary><div class="fold-body">
        <button type="button" onclick="selectVisibleScan()">Sélectionner visibles</button>
        <button type="button" onclick="selectAllScan()">Tout sélectionner</button>
        <button type="button" onclick="clearVisibleScan()">Désélectionner visibles</button>
        <button type="button" onclick="clearAllScan()">Vider sélection</button>
        <a id="scanExportSelected" class="button" href="/scan-export?ids=">Export sélection .md</a>
        <a id="scanZipSelected" class="button" href="/scan-export.zip?ids=">Export sélection .zip</a>
        <a class="button" href="/scan-export?${escapeHtml(currentQuery)}">Export tout .md</a>
        <a class="button" href="/scan-export.zip?${escapeHtml(currentQuery)}">Export tout .zip</a>
        <span id="scanSelectedCount" class="count">0 sélectionné</span>
      </div></details>
    </div>
    <details class="fold-panel"><summary>Résumé scan</summary><div class="fold-body">
      <div class="scan-grid">
        <div class="scan-card"><strong>${report.scanned_files}</strong><span>fichiers scannés</span></div>
        <div class="scan-card"><strong>${report.matched_files}</strong><span>fichiers avec hits</span></div>
        <div class="scan-card"><strong>${report.totals.occurrences}</strong><span>occurrences</span></div>
        <div class="scan-card"><strong>${report.query_mode}</strong><span>mode recherche</span></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Mot-clé</th><th>Occurrences</th><th>Fichiers</th></tr></thead><tbody>${keywords}</tbody></table></div>
    </div></details>
    <details class="fold-panel" open><summary>Résultats scan</summary><div class="fold-body">
      <div class="export-list table-wrap"><table><thead><tr><th></th><th>${sortLink("Date", "updated")}</th><th>${sortLink("Occurrences", "total")}</th><th>${sortLink("Type", "kind")}</th><th>${sortLink("Source", "source")}</th><th>${sortLink("Projet", "project")}</th><th>${sortLink("Fichier", "title")}</th></tr></thead><tbody>${files || '<tr><td colspan="7">Aucun résultat.</td></tr>'}</tbody></table></div>
    </div></details>
    <details class="fold-panel"><summary>Extraits</summary><div class="fold-body"><div class="scan-excerpt">${excerpts}</div></div></details>
  </div></main></div></body></html>`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function searchParamsObject(searchParams) {
  const out = {};
  for (const key of new Set([...searchParams.keys()])) {
    const values = searchParams.getAll(key);
    out[key] = values[values.length - 1] || "";
  }
  return out;
}

function ui(args) {
  const root = vaultRoot(args);
  const port = Number(args.port || 8421);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === "/assign" && req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        const p = new URLSearchParams(body);
        const ids = p.get("selected_ids") || p.getAll("ids").join(",");
        const project = p.get("project");
        if (ids && project) assign({ ...args, ids, project });
        res.writeHead(302, { Location: "/" });
        res.end();
      });
      return;
    }
    if ((url.pathname === "/project/create" || url.pathname === "/project/rename") && req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        const p = new URLSearchParams(body);
        try {
          if (url.pathname === "/project/create" && p.get("project")) {
            createProjectCommand({ ...args, project: p.get("project") });
          }
          if (url.pathname === "/project/rename" && p.get("from") && p.get("to")) {
            renameProjectCommand({ ...args, from: p.get("from"), to: p.get("to") });
          }
        } catch (error) {
          console.error(error.message);
        }
        res.writeHead(302, { Location: "/" });
        res.end();
      });
      return;
    }
    if (url.pathname === "/import") {
      try {
        importCommand({
          ...args,
          source: url.searchParams.get("source") || "all",
          file: url.searchParams.get("file") || "",
          from: url.searchParams.get("from") || "",
          to: url.searchParams.get("to") || ""
        });
      } catch (error) {
        console.error(error.message);
      }
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    if (url.pathname === "/chat") {
      const id = url.searchParams.get("id");
      const item = loadIndex(root).find(i => i.id === id);
      if (!item) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
      res.end(fs.readFileSync(path.join(root, item.path), "utf8"));
      return;
    }
    if (url.pathname === "/export") {
      const params = searchParamsObject(url.searchParams);
      const items = exportItems(loadIndex(root), params, root);
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="promptvault-export.md"'
      });
      res.end(exportMarkdown(root, items, params));
      return;
    }
    if (url.pathname === "/export-config") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(exportConfigHtml(root, loadIndex(root), searchParamsObject(url.searchParams)));
      return;
    }
    if (url.pathname === "/scan.json") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(deepScan(root, searchParamsObject(url.searchParams)), null, 2));
      return;
    }
    if (url.pathname === "/scan-export") {
      const params = searchParamsObject(url.searchParams);
      const items = scanExportItems(root, params);
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="promptvault-scan-export.md"'
      });
      res.end(exportMarkdown(root, items, params));
      return;
    }
    if (url.pathname === "/scan-export.zip") {
      const params = searchParamsObject(url.searchParams);
      const items = scanExportItems(root, params);
      const zip = scanZip(root, items, { ...params, keep_frontmatter: params.keep_frontmatter || "0", keep_raw: params.keep_raw || "0" });
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="promptvault-scan-export.zip"',
        "Content-Length": zip.length
      });
      res.end(zip);
      return;
    }
    if (url.pathname === "/scan") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(scanHtml(root, searchParamsObject(url.searchParams)));
      return;
    }
    if (url.pathname === "/archive") {
      try {
        archiveCommand({ ...args, ids: url.searchParams.get("ids") || url.searchParams.get("id") || "" });
      } catch (error) {
        console.error(error.message);
      }
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    if (url.pathname === "/delete") {
      try {
        deleteCommand({ ...args, ids: url.searchParams.get("ids") || url.searchParams.get("id") || "" });
      } catch (error) {
        console.error(error.message);
      }
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    if (url.pathname === "/prompts") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(promptsHtml(promptItems(root, loadIndex(root)), searchParamsObject(url.searchParams)));
      return;
    }
    if (url.pathname === "/prompt-view") {
      const item = promptItems(root, loadIndex(root)).find(i => i.id === url.searchParams.get("id"));
      if (!item) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(promptViewHtml(item, fs.readFileSync(path.join(root, item.path), "utf8")));
      return;
    }
    if (url.pathname === "/prompt") {
      const id = url.searchParams.get("id");
      const item = promptItems(root, loadIndex(root)).find(i => i.id === id);
      if (!item) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
      res.end(fs.readFileSync(path.join(root, item.path), "utf8"));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    const items = loadIndex(root);
    res.end(uiHtml(items, {
      q: url.searchParams.get("q") || "",
      q_mode: url.searchParams.get("q_mode") || "contains",
      full_text: url.searchParams.get("full_text") || "",
      project: url.searchParams.get("project") || "",
      source: url.searchParams.get("source") || "",
      status: url.searchParams.get("status") || "",
      sort: url.searchParams.get("sort") || "updated",
      dir: url.searchParams.get("dir") || "desc"
    }, projectNames(root, items), root));
  });
  server.listen(port, "127.0.0.1", () => console.log(`Prompt Vault UI: http://127.0.0.1:${port}`));
}

function usage() {
  console.log([
    "pv doctor [--vault PromptVault]",
    "pv laro",
    "pv import [--from YYYY-MM-DD --to YYYY-MM-DD] [--source codex|claude|gemini|all] [--limit N] [--vault PromptVault]",
    "pv import --source chatgpt --file conversations.json [--vault PromptVault]",
    "pv import --source perplexity --file conversation.md|conversation.json [--vault PromptVault]",
    'pv search "Nyx" [--vault PromptVault]',
    'pv prompts ["audit"] [--vault PromptVault]',
    "pv projects [--vault PromptVault]",
    "pv inbox [--vault PromptVault]",
    'pv deep-scan --keywords "Nyx,NoteCortex,BLOCAGE,NEXT" [--scope all|chats|prompts] [--out reports] [--vault PromptVault]',
    "pv backfill-prompts [--source chatgpt|claude|codex|gemini|perplexity] [--vault PromptVault]",
    "pv rebuild-index [--vault PromptVault]",
    "pv assign --ids id1,id2 --project Nyx [--vault PromptVault]",
    "pv archive --ids id1,id2 [--vault PromptVault]",
    "pv delete --ids id1,id2 [--vault PromptVault]",
    "pv ui puis /export-config pour configurer export Markdown",
    "pv project-create --project Parent/Child [--vault PromptVault]",
    "pv project-rename --from Old --to Parent/New [--vault PromptVault]",
    "pv export --ids id1,id2 --out export.md [--vault PromptVault]",
    "pv ui [--port 8421] [--vault PromptVault]"
  ].join("\n"));
}

function laro() {
  console.log([
    "Applique LARO au contenu fourni. Mode : analyse seule, amelioration, optimisation, application directe. Analyse : objectif, contraintes, faiblesses, zones floues, risques. Retravaille sans elargissement. Optimise pour action. Applique seulement corrections utiles, reversibles. Sortie : MODE UTILISE, RISQUE, AVIS, CHANGEMENTS, 3 PRO, 3 CONTRE, 3 SUGGESTIONS, NEXT.",
    "",
    "Variante stricte:",
    "Lis uniquement le contenu fourni. N'elargis pas. Mode visible. Analyse : faiblesses, risques. Propose ameliorations utiles. Applique seulement corrections reversibles. Sortie : MODE UTILISE, RISQUE, AVIS, CHANGEMENTS, 3 PRO, 3 CONTRE, 3 SUGGESTIONS, NEXT."
  ].join("\n"));
}

function main(argv = process.argv) {
  const args = parseArgs(argv);
  const cmd = args._[0] || "help";
  if (cmd === "doctor") doctor(args);
  else if (cmd === "laro") laro(args);
  else if (cmd === "import") importCommand(args);
  else if (cmd === "search") search(args);
  else if (cmd === "prompts") prompts(args);
  else if (cmd === "projects") projects(args);
  else if (cmd === "inbox") inbox(args);
  else if (cmd === "deep-scan") deepScanCommand(args);
  else if (cmd === "backfill-prompts") {
    const result = backfillPrompts(vaultRoot(args), args);
    console.log(`chats_scanned: ${result.chats_scanned}`);
    console.log(`prompts_created: ${result.prompts_created}`);
  }
  else if (cmd === "rebuild-index") console.log(`indexed: ${rebuildIndex(vaultRoot(args)).length}`);
  else if (cmd === "assign") assign(args);
  else if (cmd === "archive") archiveCommand(args);
  else if (cmd === "delete") deleteCommand(args);
  else if (cmd === "project-create") createProjectCommand(args);
  else if (cmd === "project-rename") renameProjectCommand(args);
  else if (cmd === "export") exportSelection(args);
  else if (cmd === "ui") ui(args);
  else usage();
}

if (require.main === module) main();
module.exports = {
  parseArgs,
  createVault,
  rebuildIndex,
  importCodexFile,
  importSourceFile,
  importChatGptFile,
  backfillPrompts,
  extractCodexMessages,
  extractClaudeMessages,
  extractGeminiMessages,
  promptItems,
  uiHtml,
  promptsHtml,
  promptViewHtml,
  exportItems,
  exportMarkdown,
  exportConfigHtml,
  deepScan,
  scanExportItems,
  sortedScanFiles,
  scanZip,
  scanMarkdown,
  scanHtml,
  safeProjectName,
  deleteCommand,
  classify,
  main
};
