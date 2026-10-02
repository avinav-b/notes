// Tiny helpers for the course's "op src,src -> dest" instruction notation.

export interface Insn {
	text: string;
	op: string;
	srcs: string[]; // registers and immediates, in source order
	dest: string;
}

export const isReg = (s: string) => /^[a-z]+\d+$/i.test(s);

/** Parse "div r2,r3 -> r1" (also accepts "→"). */
export function parseInsn(text: string): Insn {
	const [lhs, dest = ''] = text.split(/->|→/).map((s) => s.trim());
	const [op, ...rest] = lhs.split(/\s+/);
	const srcs = rest
		.join('')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return { text, op, srcs, dest };
}

export type DepKind = 'RAW' | 'WAR' | 'WAW';

export interface Dep {
	kind: DepKind;
	reg: string;
	from: number; // earlier instruction index
	to: number; // later instruction index
}

/**
 * All register dependences between instruction pairs (i < j) on register x,
 * where no instruction strictly between them also writes x.
 */
export function findDeps(insns: Insn[]): Dep[] {
	const deps: Dep[] = [];
	for (let j = 0; j < insns.length; j++) {
		for (let i = 0; i < j; i++) {
			const a = insns[i];
			const b = insns[j];
			const clean = (x: string) => !insns.slice(i + 1, j).some((k) => k.dest === x);
			const aReads = a.srcs.filter(isReg);
			const bReads = b.srcs.filter(isReg);
			if (bReads.includes(a.dest) && clean(a.dest)) deps.push({ kind: 'RAW', reg: a.dest, from: i, to: j });
			if (aReads.includes(b.dest) && clean(b.dest)) deps.push({ kind: 'WAR', reg: b.dest, from: i, to: j });
			if (a.dest === b.dest && clean(a.dest)) deps.push({ kind: 'WAW', reg: a.dest, from: i, to: j });
		}
	}
	return deps;
}
