// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { COURSES } from './src/courses.ts';

// https://astro.build/config
export default defineConfig({
	site: 'https://notes.avinav.ca',
	markdown: {
		processor: unified({
			remarkPlugins: [remarkMath],
			rehypePlugins: [rehypeKatex],
		}),
	},
	vite: {
		// Pre-bundle component deps at startup so the dev server doesn't re-optimize mid-session
		// (which leaves open tabs with stale "Outdated Optimize Dep" imports and dead components).
		optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'lucide-react'] },
	},
	integrations: [
		starlight({
			title: 'hello',
			components: {
				SiteTitle: './src/components/starlight/SiteTitle.astro',
				ThemeSelect: './src/components/starlight/ThemeSelect.astro',
				PageTitle: './src/components/starlight/PageTitle.astro',
				LastUpdated: './src/components/starlight/LastUpdated.astro',
				Sidebar: './src/components/starlight/Sidebar.astro',
				TableOfContents: './src/components/starlight/TableOfContents.astro',
			},
			// Pages show a `lastUpdated` date from frontmatter, falling back to the file's last git commit.
			lastUpdated: true,
			head: [
				{
					// Restore collapsed panels before first paint so they don't flash open.
					tag: 'script',
					content: `for (const p of ['sidebar', 'toc']) { try { if (localStorage.getItem('notes:hide-' + p)) document.documentElement.setAttribute('data-hide-' + p, ''); } catch {} }`,
				},
			],
			customCss: [
				'@fontsource-variable/quicksand',
				'katex/dist/katex.min.css',
				'./src/styles/theme.css',
				'./src/styles/custom.css',
			],
			sidebar: COURSES.map((c) => ({ label: c.name, items: [{ autogenerate: { directory: c.id } }] })),
		}),
		react(),
	],
});
