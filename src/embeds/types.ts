// An interactive component as used on a page, so the same settings can be rendered on the page itself
// and on its standalone embed page (/embed/<course>/<page>/<id>/, used for iframes in Obsidian).
export type EmbedComponent =
	| 'BypassPaths'
	| 'CpuDatapath'
	| 'ExecTimeline'
	| 'InsnBufferPipeline'
	| 'PipelineDiagram'
	| 'PipelineSim'
	| 'RenameDemo';

export interface Embed {
	component: EmbedComponent;
	props: Record<string, unknown>;
	/** Short description, used as the iframe/page title. */
	title: string;
	/** Iframe height in px that fits the component at Obsidian's reading width. */
	height: number;
}

export const embed = (component: EmbedComponent, title: string, height: number, props: Record<string, unknown> = {}): Embed => ({
	component,
	props,
	title,
	height,
});
