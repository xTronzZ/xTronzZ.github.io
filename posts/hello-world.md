---
title: Hello, world
date: 2026-05-22
tags: ["meta"]
---
This is the first post on my new blog. I write here mostly to keep notes for
myself, but feel free to follow along.

## What I plan to write about

- **Neuro-symbolic AI and Lean 4** &mdash; bits of the math-tutor pipeline I am
  building with Georgia Tech.
- **LLM training notes** &mdash; small experiments, ablations, things that
  surprised me.
- **Kaggle write-ups** &mdash; quick post-mortems on competitions.
- **Course notes** &mdash; whatever I am learning at De Anza.

## How this blog works

The whole site is plain HTML/CSS/JS hosted on GitHub Pages. The editor at
`/editor.html` is a Markdown editor with live preview. Drafts live in your
browser's `localStorage`, so closing the tab does not lose anything.

When I hit **Publish**, the editor commits a `.md` file to the `posts/` folder
in the repo via the GitHub API. Everyone else just sees a static page.

```python
# A small example, just to test code highlighting style.
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

That is all for now. More to come.
