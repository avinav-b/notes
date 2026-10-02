// Shared step-through controls for interactive diagrams: one hook for the state, one bar for the UI.
//
//   const stepper = useStepper(last, { intervalMs: 900 });
//   <div {...stepper.keyProps}>
//     <StepControls stepper={stepper} counter={`step ${stepper.step} / ${last}`} />
//     ...render frame `stepper.step`...
//   </div>
//
// Every button is optional: <StepControls stepper={stepper} finish={false} speed={false} />.
// Components on the same page that pass the same `syncId` share one timeline (e.g. a datapath
// animation and its pipeline diagram), even though they are separate islands.
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Gauge, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import s from './StepControls.module.css';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4];

interface StepState {
	step: number;
	playing: boolean;
	speed: number;
}

/** Playback state plus the timer that drives it. Lives outside React so islands can share it. */
class StepStore {
	state: StepState = { step: 0, playing: false, speed: 1 };
	last = 0;
	intervalMs = 1000;
	loop = false;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private listeners = new Set<() => void>();

	subscribe = (fn: () => void) => {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	};
	get = () => this.state;

	set(patch: Partial<StepState>) {
		this.state = { ...this.state, ...patch };
		this.schedule();
		for (const fn of this.listeners) fn();
	}

	private schedule() {
		clearTimeout(this.timer);
		if (!this.state.playing) return;
		if (this.state.step >= this.last && !this.loop) {
			this.state = { ...this.state, playing: false };
			return;
		}
		this.timer = setTimeout(() => {
			const next = this.state.step >= this.last ? 0 : this.state.step + 1;
			this.set({ step: next });
		}, this.intervalMs / this.state.speed);
	}
}

const sharedStores = new Map<string, StepStore>();

export interface Stepper {
	step: number;
	last: number;
	playing: boolean;
	speed: number;
	setStep: (n: number) => void;
	reset: () => void;
	back: () => void;
	next: () => void;
	finish: () => void;
	togglePlay: () => void;
	setSpeed: (x: number) => void;
	/** Spread onto the component's root: makes it focusable and maps arrow keys / space. */
	keyProps: { tabIndex: number; onKeyDown: (e: KeyboardEvent) => void };
}

interface StepperOptions {
	intervalMs?: number;
	/** Components with the same syncId share step, play state and speed. */
	syncId?: string;
	/** Wrap back to the first frame instead of stopping at the end. */
	loop?: boolean;
	/** Start playing on mount (skipped when the user prefers reduced motion). */
	autoplay?: boolean;
}

export function useStepper(last: number, { intervalMs = 1000, syncId, loop = false, autoplay = false }: StepperOptions = {}): Stepper {
	const ref = useRef<StepStore | null>(null);
	if (!ref.current) {
		if (syncId) {
			if (!sharedStores.has(syncId)) sharedStores.set(syncId, new StepStore());
			ref.current = sharedStores.get(syncId)!;
		} else ref.current = new StepStore();
	}
	const store = ref.current;
	store.last = last;
	store.intervalMs = intervalMs;
	store.loop = loop;
	const { step, playing, speed } = useSyncExternalStore(store.subscribe, store.get, store.get);
	const clamp = (n: number) => Math.max(0, Math.min(last, n));

	// Keep the step in range if the number of frames changes (e.g. a mode switch).
	useEffect(() => {
		if (step > last) store.set({ step: last });
	}, [last]);

	useEffect(() => {
		if (!autoplay) return;
		if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		store.set({ playing: true });
	}, []);

	const stepper: Stepper = {
		step: Math.min(step, last),
		last,
		playing,
		speed,
		setStep: (n) => store.set({ step: clamp(n) }),
		reset: () => store.set({ playing: false, step: 0 }),
		back: () => store.set({ playing: false, step: clamp(store.state.step - 1) }),
		next: () => store.set({ playing: false, step: clamp(store.state.step + 1) }),
		finish: () => store.set({ playing: false, step: last }),
		togglePlay: () => {
			const st = store.state;
			if (!st.playing && st.step >= last && !loop) store.set({ step: 0, playing: true });
			else store.set({ playing: !st.playing });
		},
		setSpeed: (x) => store.set({ speed: x }),
		keyProps: {
			tabIndex: 0,
			onKeyDown: (e) => {
				if ((e.target as HTMLElement).tagName === 'INPUT') return;
				if (e.key === 'ArrowRight') stepper.next();
				else if (e.key === 'ArrowLeft') stepper.back();
				else if (e.key === ' ') stepper.togglePlay();
				else return;
				e.preventDefault();
			},
		},
	};
	return stepper;
}

/** A value shared between islands on the same page (e.g. a mode toggle shown in two components). */
const sharedValues = new Map<string, { value: unknown; listeners: Set<() => void> }>();

export function useSharedValue<T>(key: string, initial: T): [T, (v: T) => void, () => T] {
	if (!sharedValues.has(key)) sharedValues.set(key, { value: initial, listeners: new Set() });
	const entry = sharedValues.get(key)!;
	const value = useSyncExternalStore(
		(fn) => {
			entry.listeners.add(fn);
			return () => {
				entry.listeners.delete(fn);
			};
		},
		() => entry.value as T,
		() => initial,
	);
	const set = (v: T) => {
		entry.value = v;
		for (const fn of entry.listeners) fn();
	};
	// The live value; `value` can briefly be the initial value while an island hydrates.
	const get = () => entry.value as T;
	return [value, set, get];
}

interface ControlsProps {
	stepper: Stepper;
	reset?: boolean;
	back?: boolean;
	next?: boolean;
	finish?: boolean;
	play?: boolean;
	speed?: boolean;
	/** Shown at the right end, e.g. "cycle 4" or "step 3 / 8". */
	counter?: ReactNode;
	/** Extra controls rendered before the stepper buttons (e.g. a mode toggle). */
	children?: ReactNode;
}

export function StepControls({
	stepper: st,
	reset = true,
	back = true,
	next = true,
	finish = true,
	play = true,
	speed = true,
	counter,
	children,
}: ControlsProps) {
	const atStart = st.step === 0;
	const atEnd = st.step >= st.last;
	const speedIdx = Math.max(0, SPEEDS.indexOf(st.speed));

	return (
		<div className={`viz-controls ${s.bar}`}>
			{children && <div className={s.extra}>{children}</div>}
			<div className={s.group}>
				{reset && (
					<button aria-label="Reset" title="Reset" onClick={st.reset} disabled={atStart}>
						<RotateCcw size={15} />
						<span className={s.label}>Reset</span>
					</button>
				)}
				{back && (
					<button aria-label="Step back" title="Step back (left arrow)" onClick={st.back} disabled={atStart}>
						<ChevronLeft size={15} />
						<span className={s.label}>Back</span>
					</button>
				)}
				{next && (
					<button className="viz-primary" aria-label="Step" title="Step (right arrow)" onClick={st.next} disabled={atEnd}>
						<ChevronRight size={15} />
						<span className={s.label}>Step</span>
					</button>
				)}
				{finish && (
					<button aria-label="Skip to end" title="Skip to end" onClick={st.finish} disabled={atEnd}>
						<SkipForward size={15} />
						<span className={s.label}>End</span>
					</button>
				)}
				{play && (
					<button
						aria-label={st.playing ? 'Pause' : 'Play'}
						title={st.playing ? 'Pause (space)' : 'Play (space)'}
						onClick={st.togglePlay}
						className={st.playing ? s.active : undefined}
					>
						{st.playing ? <Pause size={15} /> : <Play size={15} />}
						<span className={s.label}>{st.playing ? 'Pause' : 'Play'}</span>
					</button>
				)}
			</div>
			{play && speed && (
				<label className={s.speed} title="Playback speed">
					<Gauge size={15} aria-hidden="true" />
					<span className={s.label}>Speed</span>
					<input
						type="range"
						min={0}
						max={SPEEDS.length - 1}
						step={1}
						value={speedIdx}
						onChange={(e) => st.setSpeed(SPEEDS[Number(e.target.value)])}
						aria-label="Playback speed"
						aria-valuetext={`${st.speed}x`}
					/>
					<span className={s.speedValue}>{st.speed}×</span>
				</label>
			)}
			{counter !== undefined && <span className={s.counter}>{counter}</span>}
		</div>
	);
}
