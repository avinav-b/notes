// Shared step-through controls for interactive diagrams: one hook for the state, one bar for the UI.
//
//   const stepper = useStepper(last, { intervalMs: 900 });
//   <div {...stepper.keyProps}>
//     <StepControls stepper={stepper} counter={`step ${stepper.step} / ${last}`} />
//     ...render frame `stepper.step`...
//   </div>
//
// Every button is optional: <StepControls stepper={stepper} finish={false} speed={false} />.
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Gauge, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import s from './StepControls.module.css';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4];

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

export function useStepper(last: number, { intervalMs = 1000 }: { intervalMs?: number } = {}): Stepper {
	const [step, setStepRaw] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);
	const clamp = (n: number) => Math.max(0, Math.min(last, n));
	const setStep = (n: number) => setStepRaw(clamp(n));

	// Keep the step in range if the number of frames changes (e.g. a mode switch).
	useEffect(() => {
		if (step > last) setStepRaw(last);
	}, [last]);

	useEffect(() => {
		if (!playing) return;
		if (step >= last) {
			setPlaying(false);
			return;
		}
		const id = setTimeout(() => setStepRaw((x) => Math.min(last, x + 1)), intervalMs / speed);
		return () => clearTimeout(id);
	}, [playing, step, last, speed, intervalMs]);

	const stepper: Stepper = {
		step,
		last,
		playing,
		speed,
		setStep,
		reset: () => {
			setPlaying(false);
			setStepRaw(0);
		},
		back: () => {
			setPlaying(false);
			setStepRaw((x) => clamp(x - 1));
		},
		next: () => {
			setPlaying(false);
			setStepRaw((x) => clamp(x + 1));
		},
		finish: () => {
			setPlaying(false);
			setStepRaw(last);
		},
		togglePlay: () => {
			if (!playing && step >= last) setStepRaw(0);
			setPlaying((p) => !p);
		},
		setSpeed,
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
