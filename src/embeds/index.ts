import type { Embed } from './types';

export interface EmbedEntry {
	course: string;
	page: string;
	/** kebab-case form of the export name, e.g. rawSim -> raw-sim */
	id: string;
	embed: Embed;
}

const modules = import.meta.glob<Record<string, Embed>>('./*/*.ts', { eager: true });
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export const embeds: EmbedEntry[] = Object.entries(modules).flatMap(([path, mod]) => {
	const [, course, file] = path.match(/^\.\/([^/]+)\/([^/]+)\.ts$/)!;
	return Object.entries(mod).map(([name, embed]) => ({ course, page: file, id: kebab(name), embed }));
});

export const SITE_URL = 'https://notes.avinav.ca';
export const embedPath = (e: Pick<EmbedEntry, 'course' | 'page' | 'id'>) => `/embed/${e.course}/${e.page}/${e.id}/`;
