# xTronzZ.github.io

Personal homepage + blog for **Tianzhu (Cy) Xie**. Plain HTML/CSS/JS, no build
step. Hosted on GitHub Pages.

## File layout

```
.
├── index.html         # Homepage (resume / publications / projects)
├── avatar.png         # Profile photo
├── blog.html          # Blog index (Published + Drafts tabs)
├── editor.html        # Online Markdown editor
├── post.html          # Single post viewer
├── blog-style.css     # Shared styles for the three blog pages
├── js/
│   ├── blog-core.js   # Markdown, drafts, GitHub API, front-matter
│   └── editor.js      # Editor wiring (load, autosave, publish)
├── posts/
│   ├── index.json     # Published posts index (auto-maintained on publish)
│   └── hello-world.md # Example post
└── .nojekyll          # Tell GitHub Pages not to run Jekyll
```

## How the blog works

- **Drafts** are stored in your browser only (`localStorage`). They persist
  across page reloads but never leave your machine, so no token is needed to
  write.
- **Publishing** writes a Markdown file to `posts/<slug>.md` and updates
  `posts/index.json` by calling the GitHub Contents API from the browser.
  This requires a Personal Access Token (see below). The token is stored in
  `localStorage` and sent only to `api.github.com`.

### One-time setup: GitHub token

1. Visit https://github.com/settings/personal-access-tokens.
2. Click **Generate new token** → **Fine-grained tokens**.
3. Repository access → **Only select repositories** → choose
   `xTronzZ.github.io`.
4. Permissions → **Repository permissions** → set
   **Contents: Read and write**.
5. Generate, copy the token, paste it into the editor's modal the first time
   you click **Publish**.

The token never leaves your browser other than to talk to GitHub directly.

### Branch / repo config

If your default branch is not `main`, edit the constants at the top of
`js/blog-core.js`:

```js
const REPO_OWNER  = 'xTronzZ';
const REPO_NAME   = 'xTronzZ.github.io';
const REPO_BRANCH = 'main';
```

## Pushing this update to GitHub

This download was generated as a regular folder, not a git clone. To push:

```bash
cd path/to/xTronzZ.github.io-main
git init
git remote add origin https://github.com/xTronzZ/xTronzZ.github.io.git
git fetch origin
git checkout -b main
git add -A
git commit -m "Add blog with online editor; refresh resume content"
git push -u origin main --force-with-lease
```

Or, if you already have a working clone, just copy these files in on top of
the existing checkout and `git add -A && git commit && git push` as usual.

## Local preview

The blog pages do not need a build step, but they fetch local files
(`posts/*.md`, `posts/index.json`), so opening `index.html` via the `file://`
protocol will hit CORS restrictions in some browsers. Easiest preview:

```bash
python -m http.server 8000
# then open http://localhost:8000/
```
