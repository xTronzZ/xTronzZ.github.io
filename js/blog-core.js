/* =====================================================================
   blog-core.js
   Shared utilities for blog.html / editor.html / post.html
   - Markdown rendering (uses marked.js, loaded via CDN by each page)
   - YAML-ish front-matter parsing
   - Draft store (localStorage)
   - GitHub Contents API publish helpers
   - Token storage
   ===================================================================== */

(function (global) {

  // -------- Repo config ------------------------------------------------
  // The site is hosted at https://xtronzz.github.io/, which is the
  // user/organization repo `xTronzZ/xTronzZ.github.io`. The default branch
  // for GitHub user-page repos is usually `main`. Change if yours differs.
  const REPO_OWNER  = 'xTronzZ';
  const REPO_NAME   = 'xTronzZ.github.io';
  const REPO_BRANCH = 'main';
  const POSTS_DIR   = 'posts';

  // -------- localStorage keys -----------------------------------------
  const LS_TOKEN  = 'blog.gh.token';
  const LS_DRAFTS = 'blog.drafts.v1';

  // -------- Helpers ----------------------------------------------------
  function uid() {
    return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'untitled';
  }

  // -------- Front matter ----------------------------------------------
  // Very small YAML-like parser, supports key: value, lists as
  //   tags: [a, b]   or   tags: a, b
  function parseFrontMatter(text) {
    text = String(text || '');
    const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!m) return { meta: {}, body: text };
    const meta = {};
    m[1].split(/\r?\n/).forEach(line => {
      const mm = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!mm) return;
      let k = mm[1].trim(), v = mm[2].trim();
      if (v.startsWith('[') && v.endsWith(']')) {
        v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if (v.startsWith('"') && v.endsWith('"')) {
        v = v.slice(1, -1);
      } else if (v.startsWith("'") && v.endsWith("'")) {
        v = v.slice(1, -1);
      } else if (k === 'tags' && v.includes(',')) {
        v = v.split(',').map(s => s.trim()).filter(Boolean);
      }
      meta[k] = v;
    });
    return { meta, body: m[2] };
  }

  function serializeFrontMatter(meta, body) {
    const lines = ['---'];
    Object.keys(meta).forEach(k => {
      const v = meta[k];
      if (Array.isArray(v)) {
        lines.push(k + ': [' + v.map(x => JSON.stringify(x)).join(', ') + ']');
      } else if (v == null || v === '') {
        // skip empties
      } else if (/[:\n#]/.test(String(v))) {
        lines.push(k + ': ' + JSON.stringify(String(v)));
      } else {
        lines.push(k + ': ' + v);
      }
    });
    lines.push('---', '');
    return lines.join('\n') + (body || '');
  }

  // -------- Markdown ---------------------------------------------------
  function renderMarkdown(md) {
    if (typeof marked === 'undefined') return escapeHTML(md || '');
    try {
      // marked v12 returns string when async is false (default)
      return marked.parse(String(md || ''), { breaks: true, gfm: true });
    } catch (e) {
      return '<pre>' + escapeHTML(String(e && e.message || e)) + '</pre>';
    }
  }

  function makeExcerpt(md, n) {
    n = n || 160;
    const stripped = String(md || '')
      .replace(/^---[\s\S]*?---\s*/m, '')
      .replace(/^#.*$/gm, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[`*_>#\[\]\(\)!]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.length > n ? stripped.slice(0, n).trim() + '…' : stripped;
  }

  // -------- Token ------------------------------------------------------
  function getToken() { return localStorage.getItem(LS_TOKEN) || ''; }
  function setToken(t) { localStorage.setItem(LS_TOKEN, t || ''); }
  function clearToken() { localStorage.removeItem(LS_TOKEN); }

  // -------- Drafts -----------------------------------------------------
  function _readDrafts() {
    try {
      return JSON.parse(localStorage.getItem(LS_DRAFTS) || '[]');
    } catch (e) { return []; }
  }
  function _writeDrafts(arr) {
    localStorage.setItem(LS_DRAFTS, JSON.stringify(arr));
  }
  function listDrafts() { return _readDrafts(); }
  function getDraft(id) { return _readDrafts().find(d => d.id === id) || null; }
  function saveDraft(draft) {
    const all = _readDrafts();
    const now = new Date().toISOString();
    if (!draft.id) draft.id = uid();
    if (!draft.createdAt) draft.createdAt = now;
    draft.updatedAt = now;
    const i = all.findIndex(d => d.id === draft.id);
    if (i === -1) all.push(draft); else all[i] = draft;
    _writeDrafts(all);
    return draft;
  }
  function deleteDraft(id) {
    _writeDrafts(_readDrafts().filter(d => d.id !== id));
  }

  // -------- Published index --------------------------------------------
  // We keep posts/index.json as a manually + tool-maintained list:
  //   [{ slug, title, date, tags: [], excerpt }]
  async function fetchPublishedIndex() {
    const url = 'posts/index.json?cb=' + Date.now();
    const r = await fetch(url, { cache: 'no-store' });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!Array.isArray(data)) return [];
    return data;
  }

  // -------- GitHub Contents API ---------------------------------------
  // We use base64-encoded UTF-8 content with PUT to /contents/<path>.
  function _utf8ToBase64(str) {
    // Handle multibyte safely
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function _base64ToUtf8(b64) {
    const bin = atob(b64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  async function ghGetFile(path) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(path)}?ref=${REPO_BRANCH}`;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + getToken(),
      },
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GET ' + path + ' -> HTTP ' + r.status);
    const j = await r.json();
    return { sha: j.sha, content: _base64ToUtf8(j.content || '') };
  }

  async function ghPutFile(path, content, message) {
    const token = getToken();
    if (!token) throw new Error('GitHub token not set.');

    let sha = null;
    try {
      const existing = await ghGetFile(path);
      if (existing) sha = existing.sha;
    } catch (e) { /* might just not exist */ }

    const body = {
      message: message || ('Update ' + path),
      content: _utf8ToBase64(content),
      branch: REPO_BRANCH,
    };
    if (sha) body.sha = sha;

    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(path)}`;
    const r = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error('PUT ' + path + ' -> HTTP ' + r.status + ': ' + t.slice(0, 240));
    }
    return r.json();
  }

  // Publish flow: write posts/<slug>.md, then refresh posts/index.json
  async function publishPost({ slug, title, date, tags, content }) {
    if (!slug) throw new Error('slug is required');
    const mdPath = `${POSTS_DIR}/${slug}.md`;
    const md = serializeFrontMatter(
      { title: title || slug, date: date || todayISO(), tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(s=>s.trim()).filter(Boolean) : []) },
      content || ''
    );
    await ghPutFile(mdPath, md, `blog: publish ${slug}`);

    // Update posts/index.json
    let index = [];
    try {
      const existing = await ghGetFile(`${POSTS_DIR}/index.json`);
      if (existing) index = JSON.parse(existing.content || '[]');
    } catch (e) { /* keep empty */ }

    const entry = {
      slug,
      title: title || slug,
      date: date || todayISO(),
      tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(s=>s.trim()).filter(Boolean) : []),
      excerpt: makeExcerpt(content, 160),
    };
    const idx = index.findIndex(p => p.slug === slug);
    if (idx === -1) index.push(entry); else index[idx] = entry;
    // newest first
    index.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    await ghPutFile(`${POSTS_DIR}/index.json`, JSON.stringify(index, null, 2) + '\n', `blog: update index for ${slug}`);
    return entry;
  }

  // -------- Public API -------------------------------------------------
  global.BlogCore = {
    // config
    REPO_OWNER, REPO_NAME, REPO_BRANCH, POSTS_DIR,
    // helpers
    escapeHTML, slugify, todayISO, makeExcerpt,
    // markdown
    renderMarkdown,
    parseFrontMatter, serializeFrontMatter,
    // drafts
    listDrafts, getDraft, saveDraft, deleteDraft,
    // token
    getToken, setToken, clearToken,
    // github
    ghGetFile, ghPutFile,
    // published
    fetchPublishedIndex, publishPost,
  };

})(window);
