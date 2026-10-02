// Cycle-by-cycle model of the lecture's pipeline, in two configurations:
//   inorder: F | F/D | D  | D/X  | X | X/M | M | M/W | W      (classic 5-stage)
//   ooo:     F | F/D1 | D1 | insn buffer | D2 | D2/X | X | ... (decode split around a buffer)
// X holds two functional units: a 1-cycle ALU and a multi-cycle, unpipelined divider.
// One instruction per stage per cycle; results bypass from M/W back into X.

export type Mode = 'inorder' | 'ooo';
export type Unit = 'ALU' | 'DIV';

export interface FuSlot {
	id: number;
	left: number; // cycles of execution remaining; 0 = finished, waiting for M to free up
}

export interface PipeState {
	cycle: number;
	F: number | null;
	D: number | null; // D (inorder) or D1 (ooo)
	buf: number[]; // ooo only, oldest first
	D2: number | null; // ooo only
	fu: Record<Unit, FuSlot | null>;
	M: number | null;
	W: number | null;
	retired: number[]; // in the order they left W
	nextFetch: number;
	enteredX: Record<number, number>;
	leftW: Record<number, number>;
}

export interface SimConfig {
	mode: Mode;
	/** producers[i] = indices of the instructions whose results instruction i reads */
	producers: number[][];
	unitOf: (i: number) => Unit;
	latency: Record<Unit, number>;
	bufferSize: number;
}

export function simulate(n: number, cfg: SimConfig): PipeState[] {
	const { mode, producers, unitOf, latency, bufferSize } = cfg;

	let st: PipeState = {
		cycle: 0,
		F: n > 0 ? 0 : null,
		D: null,
		buf: [],
		D2: null,
		fu: { ALU: null, DIV: null },
		M: null,
		W: null,
		retired: [],
		nextFetch: 1,
		enteredX: {},
		leftW: {},
	};
	const hist = [st];

	while (st.retired.length < n && hist.length < 300) {
		const nx: PipeState = {
			...st,
			cycle: st.cycle + 1,
			buf: [...st.buf],
			fu: { ...st.fu },
			retired: [...st.retired],
			enteredX: { ...st.enteredX },
			leftW: { ...st.leftW },
		};

		// W retires, M → W.
		if (st.W !== null) {
			nx.retired.push(st.W);
			nx.leftW[st.W] = nx.cycle;
		}
		nx.W = st.M;

		// X: count down each unit; the oldest finished instruction moves into M.
		for (const u of ['ALU', 'DIV'] as Unit[]) {
			const slot = st.fu[u];
			nx.fu[u] = slot ? { ...slot, left: Math.max(0, slot.left - 1) } : null;
		}
		const finished = (['ALU', 'DIV'] as Unit[])
			.filter((u) => nx.fu[u]?.left === 0)
			.sort((a, b) => nx.fu[a]!.id - nx.fu[b]!.id);
		nx.M = null;
		if (finished.length) {
			nx.M = nx.fu[finished[0]]!.id;
			nx.fu[finished[0]] = null;
		}

		// A result is usable once its producer has left X (bypassed from M or W).
		const leftX = (p: number) => nx.M === p || nx.W === p || nx.retired.includes(p);
		const ready = (i: number) => producers[i].every(leftX);
		// For selecting into D2 a cycle ahead: also OK if the producer finishes X this cycle.
		const readyNextCycle = (i: number) =>
			producers[i].every((p) => leftX(p) || (['ALU', 'DIV'] as Unit[]).some((u) => nx.fu[u]?.id === p && nx.fu[u]!.left === 1));
		const unitFreeNextCycle = (i: number) => {
			const slot = nx.fu[unitOf(i)];
			return slot === null || slot.left === 1;
		};

		// Issue into X from D (inorder) or D2 (ooo).
		const issuer = mode === 'inorder' ? st.D : st.D2;
		let issued = false;
		if (issuer !== null && nx.fu[unitOf(issuer)] === null && ready(issuer)) {
			nx.fu[unitOf(issuer)] = { id: issuer, left: latency[unitOf(issuer)] };
			nx.enteredX[issuer] = nx.cycle;
			issued = true;
		}

		if (mode === 'inorder') {
			nx.D = issued ? null : st.D;
			nx.F = st.F;
			if (nx.F !== null && nx.D === null) {
				nx.D = nx.F;
				nx.F = null;
			}
		} else {
			nx.D2 = issued ? null : st.D2;
			// D2 selects the oldest ready instruction from the buffer, including one arriving from D1 now.
			const candidates = st.D !== null ? [...st.buf, st.D] : [...st.buf];
			if (nx.D2 === null) {
				const pick = candidates.find((i) => readyNextCycle(i) && unitFreeNextCycle(i));
				if (pick !== undefined) {
					candidates.splice(candidates.indexOf(pick), 1);
					nx.D2 = pick;
				}
			}
			// Whatever is left goes into the buffer; D1 stalls if the buffer is full.
			nx.D = null;
			if (candidates.length > bufferSize) nx.D = candidates.pop()!;
			nx.buf = candidates;
			nx.F = st.F;
			if (nx.F !== null && nx.D === null) {
				nx.D = nx.F;
				nx.F = null;
			}
		}

		if (nx.F === null && nx.nextFetch < n) nx.F = nx.nextFetch++;

		hist.push(nx);
		st = nx;
	}
	return hist;
}
