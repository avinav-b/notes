# Notes

Course notes as an [Astro](https://astro.build) + [Starlight](https://starlight.astro.build) site. Pages are Markdown/MDX with interactive React components inline.

```
src/content/docs/<course>/<note>.mdx   # one page per note (sidebar is auto-generated per course folder)
src/components/                        # interactive components (React + CSS modules)
src/styles/custom.css                  # shared colour tokens (light/dark) for components
```

- Math: `$inline$` and `$$display$$` via remark-math + KaTeX.
- Interactive component: `import X from '../../../components/X.tsx'` then `<X client:visible />`. `client:visible` loads the JS only when it scrolls into view.

```
npm run dev     # http://localhost:4321
npm run build   # static site in dist/
```
