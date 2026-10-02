---
name: create-new-note
description: Given an initial Obsidian markdown draft of a set of notes, create the page for it in the web app
---

Given the markdown document, create or update the notes on the web app. The new notes in Obsidian are rough notes that I took while in lecture.

# Content Editing Rules

Your goal, above all is to make content ACCURATE, CLEAR, and CONCISE. Language should be SIMPLE and EASY TO UNDERSTAND while still never sacrificing CORRECTNESS or DETAIL. Content should be easy to read and understand at a glance, i.e. not just a wall of prose like a textbook.

Feel free to re-format and re-organize content. This can be: 
- changing around headings and heading levels 
- re-ordering content
- re-formatting content in to/out of prose, bullet points, ordered lists, or tables
- putting content into other features such as block quotes and callouts (see below)

Make these edits as long as they help your goal list above.

## Callouts

Only use these four callout types. They are Starlight asides, and no other names render:

| Type | Use for |
| --- | --- |
| `note` | Neutral context, assumptions, side information |
| `tip` | Key ideas, takeaways, shortcuts, helpful framing |
| `caution` | Common mistakes, subtle points, things that must hold for correctness |
| `danger` | Things that are actually wrong or break if ignored (use rarely) |

Syntax, with an optional title in brackets:

```
:::tip[Takeaway]
Renaming removes WAR/WAW but keeps RAW.
:::
```

## Proposed content changes

In some cases, especially if you encounter incorrect or misleading information, you may want to edit the content itself. DO NOT EDIT THE ACTUAL CONTENT. Instead, at the end of the job, describe to the user exactly what content you want to change, what you want to change it to, and how that change will make the notes better hit the goals mentioned above.

- Number every proposed change (1, 2, 3, ...) so the user can approve or reject them by number (e.g. "apply #1 and #3").
- Quote the current text and the exact replacement text for each.
- Never apply a proposed change until the user approves that specific number.

NEVER USE EMOJIS ANYWHERE

# Updating an existing page

You may be asked to update a page because there is new content in the Obsidian doc that is not in the web app doc. In this case, just add on to and/or modify the existing web app doc.

After a writeback (see below), the Obsidian note already contains the cleaned-up version of everything on the site, with iframes where the artifacts are. New lecture notes get added to it as rough text and new `[!claude]` callouts. Compare the Obsidian note against the site page to find what's new; don't reprocess or rewrite the parts that already match.

# Files and frontmatter

- **Source:** Obsidian vault at `~/Documents/Obsidian/personal/`. Each course is a folder named by its course code (e.g. `ece552/`). Pasted images live at the vault root (e.g. `~/Documents/Obsidian/personal/Pasted image 20260930093602.png`).
- **Destination:** `src/content/docs/<course>/<slug>.mdx`, where `<course>` matches the vault folder name and `<slug>` is the note title in kebab-case (e.g. `Dynamic Scheduling.md` becomes `dynamic-scheduling.mdx`).
- **New course:** if the course folder doesn't exist yet, add it to `COURSES` in `src/courses.ts` (e.g. `{ id: 'ece552', name: 'ECE552: Computer Architecture' }`). That adds it to both the sidebar and the homepage list. Ask the user for the course's full name if you don't know it.
- **Images** that are not being replaced by an artifact: copy them into `src/assets/<course>/` with a descriptive kebab-case filename, and reference them with normal Markdown image syntax so Astro optimizes them. Keep the width from Obsidian's `|369` suffix if one is given.

Every page starts with this frontmatter:

```yaml
---
title: Dynamic Scheduling
description: One sentence saying what the page covers.
lastUpdated: 2026-10-01 # the date of this run (YYYY-MM-DD); update it whenever the page content changes
sidebar:
  order: 5 # position in the course, in lecture order
---
```

For `sidebar.order`, follow lecture order. Work it out from the note itself or from the existing pages in the course; if it isn't clear where the new page belongs, ask the user.

# Linking

Pages should be linked to each other wherever a concept is covered elsewhere on the site. Every time this skill runs, do a linking audit:

1. **Obsidian links in the source.** Convert `[[Note]]`, `[[Note#Heading]]` and `[[Note|alias]]` into site links (`[alias](/course/slug/#heading-anchor)`). If the target page doesn't exist on the site yet, keep the text unlinked and mention it in your final report.
2. **Outgoing links from this page.** Read the new or updated page and look for concepts that have their own page or section elsewhere on the site (e.g. "register renaming", "Tomasulo", "RAW hazard"). Link them.
3. **Incoming links to this page.** Search every other page on the site (all courses) for mentions of concepts this page covers, and link those mentions to this page or to the specific section.

Rules for links:
- Use root-relative URLs (`/ece552/dynamic-scheduling/#register-renaming`). Section anchors are the heading text, lowercased, with spaces as hyphens and punctuation removed; check the anchor exists in the built HTML.
- Link only the first mention of a concept per section, not every occurrence.
- Never put links in headings, code, math, or inside components.
- Adding a link is a formatting change, not a content change, so it doesn't need approval. The wording around it must stay the same.
- In your final report, list every page you added links to, and what you linked.

# Writeback to Obsidian

After the site page is finished and checked, write the cleaned-up notes back into the Obsidian note, so the vault matches the site.

1. **Back up first.** Copy the current Obsidian note to `<vault>/<course>/.raw/<Note title>.md`, replacing any older backup. Obsidian hides dot-folders, so backups don't clutter the vault.
2. **Overwrite the note** with the site page's content, converted to Obsidian markdown:

| On the site (MDX) | In Obsidian |
| --- | --- |
| Frontmatter and `import` lines | Removed |
| `:::tip[Title]` ... `:::` | `> [!tip] Title`, with every body line prefixed by `> ` (same for `note`, `caution`, `danger`; no title means just `> [!tip]`) |
| `<Component client:visible {...rawSim.props} />` | `<iframe src="https://notes.avinav.ca/embed/<course>/<slug>/<id>/" title="<embed title>" width="100%" height="<embed height>" style="border:0"></iframe>` |
| `[text](/ece552/dynamic-scheduling/#register-renaming)` | `[[Dynamic Scheduling#Register Renaming\|text]]` (the target note's title and the heading's text; drop `\|text` when it's identical to the target) |
| A link whose text is bold, `[**text**](...)` | `**[[Target\|text]]**` (bold outside the link; Obsidian doesn't render formatting inside link aliases) |
| A wikilink with alias inside a table row | Escape the alias pipe: `[[Target\\|text]]`, or the table splits |
| Headings, lists, tables (including `<br />` in cells), `$math$`, code blocks, bold/italic, block quotes | Unchanged |

3. **Claude callouts are gone** in the written-back note: each one has been replaced by the iframe of the artifact it asked for, and the reference images that went with it are removed.
4. **Any approved content changes** are already on the site page, so they carry over. Proposed changes that haven't been approved don't go into the note either.

The iframes only work once the site, with the new embed pages, is deployed to notes.avinav.ca. Mention this in your report if you added new artifacts.

# Claude callouts

In the Obsidian notes, you will encounter callouts to yourself, marked like below:

> [!claude]
> This is an example of a Claude callout

This callout will often provide you with instructions for modifying or inserting content.

Claude callouts are instructions, not content: carry out what they say, then remove them entirely. They must never appear on the published page.

## 2D Artifacts: simulations, animations, and figures

Sometimes, these callouts will tell you to implement a figure, animation or a 2d simulation of some sort. These are often accompanied by images directly above. These images are meant to be replaced by whatever you create, and the images are only to be used as reference, not something for you to just copy.

Aim to make these artifacts as educational and simple to understand as possible, they are meant to be there to teach. 

Take your time to make them as polished and complete as you can.

Make sure to search through other similar artifacts in related pages/notes or on the same page. Often, you may want to use the same underlying figure or make slight modifications to it, as it helps the user see continuity between two different artifacts which are meant to represent the same underlying thing

There is a shared step through component that you may be able to use for simulations and animations.

NEVER USE EMOJIS ANYWHERE. USE LUCIDE ICONS IF ICONS ARE NEEDED

## 3D Artifacts: simulations, animations, and figures

In some cases, the user may suggest or you may think that a 3d visualization better suits a particular concept. If so, take your time to make a detailed, easy to understand, full 3d model and use three.js. Take your time to make a solid, polished, and professional product.

There is a shared step through component that you may be able to use for simulations and animations.

NEVER USE EMOJIS ANYWHERE. USE LUCIDE ICONS IF ICONS ARE NEEDED

# Design language

Every page and artifact should look like part of the same site. Look at the existing components in `src/components/` before building a new one, and match them.

## Look and feel

- **Font:** Quicksand for all text; the system monospace (`var(--viz-mono)`) for code, register names, and instruction text inside figures.
- **Dark mode is primary:** near-black reading area, with the side panels a shade lighter. Light mode must also work.
- **Accent:** purple (`--sl-color-accent`, with `-low` and `-high` variants). Use it for the main action, the current step, and active highlights, not for decoration.
- **Icons:** Lucide only (`lucide-react` in React, or imported into `.astro` files). Never emojis, and never Unicode symbols standing in for icons (like play/pause characters on buttons).
- **Calm and flat:** thin borders, small rounded corners (about 6px), no drop shadows or gradients. Colour carries meaning, so don't add colour that doesn't.

## Colour

Never hard-code colours. Use the theme tokens so both light and dark mode work:

- Starlight tokens for structure: `--sl-color-bg`, `--sl-color-text`, `--sl-color-gray-1` to `-6`, `--sl-color-accent*`.
- Shared figure tokens from `src/styles/custom.css`: `--viz-surface` (component background), `--viz-border`, and the meaning colours below.

Keep each meaning colour tied to one meaning everywhere on the site:

| Token | Meaning |
| --- | --- |
| `--viz-ok` | Ready, available, newly allocated, correct |
| `--viz-raw` | RAW / true dependence, or waiting on a result (dashed outline when waiting) |
| `--viz-war` | WAR / anti-dependence, or stuck behind something else |
| `--viz-waw` | WAW / output dependence |
| `--sl-color-accent` | The current step, the thing being looked at right now |

If a new concept needs a new colour, add a token pair (light and dark) to `custom.css` rather than a one-off value.

## Interactive artifacts

- **Structure:** React component in `src/components/<Name>.tsx` with a `.module.css` file. Wrap the root in `not-content` so Starlight's prose styles don't leak in, and give it the standard card look (`--viz-surface` background, `--viz-border` border, rounded corners, `1rem` padding).
- **Embedding:** every artifact used on a page is registered in `src/embeds/<course>/<slug>.ts` with `embed(component, title, height, props)`, exported under a camelCase name. The page imports it and spreads its props: `<PipelineSim client:visible {...rawSim.props} />`. The same entry also produces a standalone page at `/embed/<course>/<slug>/<kebab-name>/` (e.g. `rawSim` becomes `raw-sim`), which writeback uses for iframes. `client:visible` means the code only loads when scrolled into view. Make components data-driven through props (e.g. the program to animate) so other pages can reuse them.
- **New component types** must also be added to `EmbedComponent` in `src/embeds/types.ts` and to the component list in `src/pages/embed/[course]/[page]/[id].astro`.
- **Iframe height:** set `height` to the tallest the embed page gets at 700px wide, across every step and mode, plus about 12px. Measure it: load the embed page in an iframe 700px wide, step through everything, and record `document.body`'s height.
- **Step-through animations** use the shared `useStepper` + `StepControls` from `src/components/StepControls.tsx`. Don't build custom playback buttons. Keep the button text labels; icons alone confused the user.
- **Explain as you go:** above the figure, a short message says what the current step is doing and why, in plain language. Add a legend for every colour or line style used.
- **Motion:** move things with CSS transitions (roughly 300 to 700ms, ease-in-out) so the eye can follow what changed. Elements should slide or swing to their new place, not jump.
- **Figures:** draw with inline SVG using a `viewBox`, so they scale to the content column (about 45rem wide). Keep text at least about 11px at that width. Use the monospace font for code-like labels.
- **Hover and tap:** anything that reveals detail on hover must also work on tap, for phones.
- **Responsive:** check at phone width. Let control bars wrap rather than shrink text or hide labels.

# Before you finish

Check all of the following before reporting back:

1. **It builds.** `npx tsc --noEmit` and `npm run build` both pass with no errors.
2. **It looks right.** Open the page with the dev server (see CLAUDE.md) and check it at desktop and phone widths, in both light and dark mode. Nothing overlaps, overflows sideways, or is too small to read.
3. **Interactive components actually work.** Scroll to each one and click its controls; the frame must change. Components can render but silently fail to load, which looks fine but ignores clicks. If that happens, check the browser console. "Outdated Optimize Dep" errors mean the dev server needs a restart and a hard reload.
4. **Animations and figures are correct.** Check the results they show against the notes and against your own working (e.g. trace the final map table by hand). Reference images in the notes can be wrong. If one is, don't copy the mistake: build the correct version and point out the discrepancy in your report.
5. **Links resolve.** Every link you added points to a page and anchor that exists in the build.
6. **No Claude callouts or emojis** remain on any page you touched.
7. **Embeds and writeback.** Every artifact on the page has a working `/embed/...` page with a measured height, and the Obsidian note was backed up and rewritten with an iframe for each one.

Then report: what you changed, the pages you linked, any discrepancies you found, the numbered list of proposed content changes, and that the Obsidian note was written back.
