// An interactive component as used on a page, so the same settings can be rendered on the page itself
// and on its standalone embed page (/embed/<course>/<page>/<id>/, used for iframes in Obsidian).
export type EmbedComponent =
	| 'AddressTranslation'
	| 'AmatBar'
	| 'AmdahlCurve'
	| 'AmdahlExplorer'
	| 'DeadBlockPrefetch'
	| 'LocalityDemo'
	| 'MemoryGapChart'
	| 'ArrayLayout'
	| 'BasicBlocks'
	| 'BranchPredictorSim'
	| 'BtbLookup'
	| 'BuddyAllocator'
	| 'BypassPaths'
	| 'CacheSim'
	| 'CarBusRace'
	| 'CoalesceCases'
	| 'CodeSteps'
	| 'CompilerFlow'
	| 'CompletionOrder'
	| 'ControlHazardPipeline'
	| 'CounterFsm'
	| 'CpiBars'
	| 'CpiStack'
	| 'CpuDatapath'
	| 'ExceptionTimeline'
	| 'ExecTimeline'
	| 'FuPipelines'
	| 'FuSchedule'
	| 'GcGraph'
	| 'HeapSim'
	| 'HybridPredictor'
	| 'InsnBufferPipeline'
	| 'IssueSlots'
	| 'MatrixAccess'
	| 'MemFigure'
	| 'MemoryHierarchy'
	| 'MisalignedRead'
	| 'OooTimeline'
	| 'OptimizationLadder'
	| 'PhkMalloc'
	| 'PipelineDiagram'
	| 'PredictorTables'
	| 'PipelineSim'
	| 'R10kSim'
	| 'ReductionTree'
	| 'RenameDemo'
	| 'RobLsqDemo'
	| 'SamplingProfiler'
	| 'SegregatedLists'
	| 'StageSplit'
	| 'ServerTimeline'
	| 'StridePrefetcher'
	| 'StructLayout'
	| 'ThroughputCurve'
	| 'TilingViz'
	| 'TlbReach'
	| 'TomasuloOrg'
	| 'TomasuloSim'
	| 'VirtualMapping';

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
