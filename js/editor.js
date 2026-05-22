/* =====================================================================
   editor.js  -  Markdown editor logic
   - Loads existing draft (?draft=<id>) or published post (?edit=<slug>)
   - Auto-saves drafts every few seconds
   - Live preview
   - Publish-to-GitHub via BlogCore.publishPost
   ===================================================================== */

(function () {
  const $ = (sel) => document.querySelector(sel);

  const titleEl   = $('#title');
  const slugEl    = $('#slug');
  const tagsEl    = $('#tags');
  const dateEl    = $('#date');
  const contentEl = $('#content');
  const previewEl = $('#preview');
  const statusEl  = $('#status-text');
  const editorPane = $('#editor-pane');

  const params = new URLSearchParams(location.search);
  const editSlug = params.get('edit');
  const draftId  = params.get('draft');

  // Current draft state held in-memory
  let state = {
    id: null,
    sourceSlug: null,   // if loaded from a published post (so publish re-uses it)
    title: '',
    slug: '',
    tags: '',
    date: BlogCore.todayISO(),
    content: '',
  };

  let dirty = false;
  let saveTimer = null;

  // -------------------- Loaders --------------------------------------
  function setStatus(s) { statusEl.textContent = s; }

  function updatePreview() {
    previewEl.innerHTML = BlogCore.renderMarkdown(contentEl.value);
  }

  function loadStateIntoUI() {
    titleEl.value   = state.title || '';
    slugEl.value    = state.slug || '';
    tagsEl.value    = Array.isArray(state.tags) ? state.tags.join(', ') : (state.tags || '');
    dateEl.value    = state.date || BlogCore.todayISO();
    contentEl.value = state.content || '';
    updatePreview();
  }

  function pullStateFromUI() {
    state.title   = titleEl.value.trim();
    state.slug    = (slugEl.value || '').trim() || BlogCore.slugify(state.title);
    state.tags    = tagsEl.value.split(',').map(s => s.trim()).filter(Boolean);
    state.date    = dateEl.value.trim() || BlogCore.todayISO();
    state.content = contentEl.value;
  }

  async function loadPublishedForEdit(slug) {
    setStatus('Loading published post…');
    try {
      // Prefer raw fetch (anonymous, no token needed)
      const r = await fetch('posts/' + encodeURIComponent(slug) + '.md?cb=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      const parsed = BlogCore.parseFrontMatter(text);
      state.sourceSlug = slug;
      state.title = parsed.meta.title || slug;
      state.slug  = slug;
      state.tags  = parsed.meta.tags || [];
      state.date  = parsed.meta.date || BlogCore.todayISO();
      state.content = parsed.body;
      // Treat as a fresh draft tied to that slug
      state.id = 'edit-' + slug;
      loadStateIntoUI();
      setStatus('Loaded published post. Edits are saved as a draft until you publish.');
    } catch (e) {
      setStatus('Could not load: ' + e.message);
    }
  }

  function loadDraft(id) {
    const d = BlogCore.getDraft(id);
    if (!d) { setStatus('Draft not found.'); return; }
    state = {
      id: d.id,
      sourceSlug: d.sourceSlug || null,
      title: d.title || '',
      slug: d.slug || '',
      tags: d.tags || '',
      date: d.date || BlogCore.todayISO(),
      content: d.content || '',
    };
    loadStateIntoUI();
    setStatus('Loaded draft.');
  }

  // -------------------- Save / autosave -------------------------------
  function saveDraftNow(silent) {
    pullStateFromUI();
    const saved = BlogCore.saveDraft({
      id: state.id,
      sourceSlug: state.sourceSlug,
      title: state.title,
      slug: state.slug,
      tags: state.tags,
      date: state.date,
      content: state.content,
    });
    state.id = saved.id;
    dirty = false;
    if (!silent) setStatus('Draft saved at ' + new Date().toLocaleTimeString() + '.');
  }

  function scheduleAutosave() {
    dirty = true;
    setStatus('Editing…');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveDraftNow(true);
      setStatus('Draft auto-saved at ' + new Date().toLocaleTimeString() + '.');
    }, 1500);
  }

  // -------------------- Publish ---------------------------------------
  // tokenModalContext: 'publish' (opened because publish needed a token) or
  // 'manage' (user clicked Token button just to view / change / clear)
  let tokenModalContext = 'manage';

  function openTokenModal(context) {
    tokenModalContext = context || 'manage';
    const modal = document.getElementById('token-modal');
    const input = document.getElementById('token-input');
    input.value = BlogCore.getToken() || '';
    document.getElementById('token-save').textContent =
      tokenModalContext === 'publish' ? 'Save & Publish' : 'Save';
    modal.style.display = '';
    input.focus();
  }
  function closeTokenModal() {
    document.getElementById('token-modal').style.display = 'none';
  }

  async function doPublish() {
    pullStateFromUI();
    if (!state.title) { alert('Please add a title before publishing.'); titleEl.focus(); return; }
    if (!state.slug)  state.slug = BlogCore.slugify(state.title);

    const token = BlogCore.getToken();
    if (!token) { openTokenModal('publish'); return; }

    saveDraftNow(true);
    setStatus('Publishing to GitHub…');

    try {
      await BlogCore.publishPost({
        slug:    state.slug,
        title:   state.title,
        date:    state.date,
        tags:    state.tags,
        content: state.content,
      });
      setStatus('Published! GitHub Pages may take ~30s to refresh.');
      // Remove the local draft now that it is published
      if (state.id) {
        BlogCore.deleteDraft(state.id);
        state.id = null;
      }
      // Small toast / redirect option
      if (confirm('Published. Open the post now?')) {
        location.href = 'post.html?slug=' + encodeURIComponent(state.slug);
      }
    } catch (e) {
      console.error(e);
      // Auto-prompt for a new token if the token was rejected
      const msg = String(e && e.message || e);
      const looksLikeAuth = /HTTP\s4(0[13]|22)\b/.test(msg) ||
        /Bad credentials/i.test(msg) ||
        /not accessible by personal access token/i.test(msg) ||
        /Requires authentication/i.test(msg);
      if (looksLikeAuth) {
        BlogCore.clearToken();
        setStatus('Token rejected by GitHub. Please paste a new token.');
        alert(
          'GitHub rejected the token (likely 403 / wrong permissions).\n\n' +
          'The saved token has been cleared. Please paste a fresh fine-grained PAT with\n' +
          'Repository: xTronzZ.github.io, Permissions > Contents: Read and write.'
        );
        openTokenModal('publish');
        return;
      }
      setStatus('Publish failed: ' + msg);
      alert('Publish failed:\n' + msg);
    }
  }

  // -------------------- Wire up ---------------------------------------
  [titleEl, slugEl, tagsEl, dateEl, contentEl].forEach(el => {
    el.addEventListener('input', () => {
      if (el === contentEl) updatePreview();
      // Auto-fill slug from title if user has not typed one
      if (el === titleEl && !slugEl.value.trim()) {
        slugEl.placeholder = BlogCore.slugify(titleEl.value) || 'auto-from-title';
      }
      scheduleAutosave();
    });
  });

  document.getElementById('btn-save-draft').addEventListener('click', (e) => {
    e.preventDefault();
    saveDraftNow();
  });

  document.getElementById('btn-publish').addEventListener('click', (e) => {
    e.preventDefault();
    doPublish();
  });

  document.getElementById('btn-toggle-preview').addEventListener('click', (e) => {
    e.preventDefault();
    const single = editorPane.style.gridTemplateColumns === '1fr';
    if (single) {
      editorPane.style.gridTemplateColumns = '1fr 1fr';
      previewEl.style.display = '';
    } else {
      editorPane.style.gridTemplateColumns = '1fr';
      previewEl.style.display = 'none';
    }
  });

  document.getElementById('btn-delete').addEventListener('click', (e) => {
    e.preventDefault();
    if (!state.id) { setStatus('Nothing to delete (draft not yet saved).'); return; }
    if (!confirm('Delete this draft? This cannot be undone.')) return;
    BlogCore.deleteDraft(state.id);
    state.id = null;
    setStatus('Draft deleted.');
    location.href = 'blog.html';
  });

  document.getElementById('btn-token').addEventListener('click', (e) => {
    e.preventDefault();
    openTokenModal('manage');
  });

  document.getElementById('token-cancel').addEventListener('click', (e) => {
    e.preventDefault();
    closeTokenModal();
  });

  document.getElementById('token-clear').addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirm('Remove the saved GitHub token from this browser?')) return;
    BlogCore.clearToken();
    document.getElementById('token-input').value = '';
    setStatus('Token cleared from this browser.');
    closeTokenModal();
  });

  document.getElementById('token-save').addEventListener('click', async (e) => {
    e.preventDefault();
    const v = document.getElementById('token-input').value.trim();
    if (!v) { alert('Please paste a token.'); return; }
    BlogCore.setToken(v);
    const ctx = tokenModalContext;
    closeTokenModal();
    setStatus('Token saved.');
    if (ctx === 'publish') {
      await doPublish();
    }
  });

  // Warn before leaving with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // -------------------- Boot ------------------------------------------
  if (editSlug) {
    loadPublishedForEdit(editSlug);
  } else if (draftId) {
    loadDraft(draftId);
  } else {
    // brand new
    state.date = BlogCore.todayISO();
    loadStateIntoUI();
  }
})();
