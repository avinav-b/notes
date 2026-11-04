// A small cycle-by-cycle list scheduler for dataflow graphs, used by FuSchedule and ReductionTree.
//
// Each op names the unit class it needs, its latency, and the ops whose results it reads. Every cycle,
// ops are considered oldest first (array order); an op starts once all its inputs have finished and a
// unit that accepts it has a free issue slot this cycle. Units are fully pipelined: a unit takes a new
// op every cycle, however long each op takes. Pass `count: Infinity` for unlimited units of a class.

export interface SchedOp {
	/** Unit class this op needs, e.g. 'load', 'int', 'branch', 'mul'. */
	kind: string;
	/** Cycles from start until the result can be used. */
	lat: number;
	/** Indices (into the op array) of the ops this op reads. Must point to earlier ops. */
	deps: number[];
}

export interface UnitDef {
	name: string;
	/** Op kinds this unit can execute. */
	accepts: string[];
	/** How many identical units (default 1). Infinity = as many as needed. */
	count?: number;
}

export interface Placed {
	/** First cycle of execution (cycles are numbered from 1). */
	start: number;
	/** Last cycle of execution, start + lat - 1. The result is usable from end + 1. */
	end: number;
	/** Index into `units`. */
	unit: number;
	/** Which copy of that unit (0-based; for unlimited units, the lane it was drawn in). */
	copy: number;
}

export function listSchedule(ops: SchedOp[], units: UnitDef[], maxCycles = 10_000): Placed[] {
	const placed: (Placed | null)[] = ops.map(() => null);
	let remaining = ops.length;
	for (let c = 1; remaining > 0 && c <= maxCycles; c++) {
		const used = units.map(() => 0); // issue slots taken this cycle, per unit
		for (let k = 0; k < ops.length; k++) {
			if (placed[k]) continue;
			const op = ops[k];
			if (!op.deps.every((d) => placed[d] && placed[d]!.end < c)) continue;
			// Among free units that accept the op, use the most specialised one (keeps e.g. the
			// branch-capable integer unit free for branches).
			let u = -1;
			units.forEach((un, ui) => {
				if (!un.accepts.includes(op.kind) || used[ui] >= (un.count ?? 1)) return;
				if (u < 0 || un.accepts.length < units[u].accepts.length) u = ui;
			});
			if (u < 0) continue;
			placed[k] = { start: c, end: c + op.lat - 1, unit: u, copy: used[u] };
			used[u]++;
			remaining--;
		}
	}
	return placed.map((p) => p ?? { start: Infinity, end: Infinity, unit: -1, copy: 0 });
}
