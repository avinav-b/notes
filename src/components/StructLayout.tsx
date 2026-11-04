// How a C struct is laid out in bytes: each field goes at the next offset that is a multiple of its
// alignment (gaps become padding), then the size rounds up to a multiple of the largest alignment K.
// Fields keep their identity across variants, so reordering a struct slides them to their new places.
import { useMemo, useState } from "react";
import { StepControls, useStepper } from "./StepControls";
import s from "./StructLayout.module.css";

const TYPES: Record<string, number> = {
  char: 1,
  short: 2,
  int: 4,
  float: 4,
  double: 8,
  pointer: 8,
  long: 8,
};

interface FieldSpec {
  name: string;
  type?: string;
  /** For non-standard fields (e.g. a malloc payload). */
  size?: number;
  align?: number;
  /** Declaration text in the code line; consecutive fields with the same decl share it. */
  decl?: string;
}
interface StructSpec {
  label: string;
  /** Code line shown above the figure. Built from the fields if omitted. */
  code?: string;
  name?: string;
  fields: FieldSpec[];
  /** Force the struct alignment K (e.g. __attribute__((aligned(8))) or malloc's word alignment). */
  align?: number;
}
interface Props {
  structs: StructSpec[];
  /** Also draw an array of this many structs (a few elements shown). */
  array?: number;
  /** Name used for the base pointer in the ruler. */
  base?: string;
}

interface Placed {
  name: string;
  type: string;
  size: number;
  align: number;
  off: number;
  pad: number; // padding inserted before this field
  decl: string;
}

function lay(st: StructSpec) {
  let off = 0;
  const placed: Placed[] = st.fields.map((f) => {
    const size = f.size ?? TYPES[f.type ?? "int"];
    const align = f.align ?? size;
    const at = Math.ceil(off / align) * align;
    const p = {
      name: f.name,
      type: f.type ?? `${size} B`,
      size,
      align,
      off: at,
      pad: at - off,
      decl: f.decl ?? `${f.type} ${f.name}`,
    };
    off = at + size;
    return p;
  });
  const K = st.align ?? Math.max(...placed.map((p) => p.align));
  const size = Math.ceil(off / K) * K;
  return {
    placed,
    K,
    data: placed.reduce((a, p) => a + p.size, 0),
    end: off,
    size,
  };
}

const W = 680;
const X0 = 20;
const ROW_Y = 30;
const ROW_H = 40;

export default function StructLayout({
  structs,
  array = 0,
  base = "p",
}: Props) {
  const [vi, setVi] = useState(0);
  const lays = useMemo(() => structs.map(lay), [JSON.stringify(structs)]);
  const L = lays[vi];
  const st = structs[vi];
  const n = L.placed.length;
  const stepper = useStepper(n + 1, { intervalMs: 1300 });
  const step = Math.min(stepper.step, n + 1);

  const maxBytes = Math.max(...lays.map((l) => l.size));
  const cw = Math.min(34, (W - X0 - 150) / maxBytes);
  const x = (b: number) => X0 + b * cw;
  const shown = L.placed.slice(0, step);
  const done = step === n + 1;
  const cur = step >= 1 && step <= n ? L.placed[step - 1] : null;
  const filled = done
    ? L.size
    : shown.length
      ? shown[shown.length - 1].off + shown[shown.length - 1].size
      : 0;
  const padTotal =
    (done ? L.size : filled) - shown.reduce((a, p) => a + p.size, 0);

  const msg =
    step === 0
      ? `K = ${L.K}: ${st.align ? "required alignment" : "the largest field alignment"}`
      : cur
        ? cur.pad
          ? `${cur.name} needs an offset that's a multiple of ${cur.align}: pad ${cur.pad}`
          : `${cur.name} (${cur.size} B) fits at offset ${cur.off}`
        : L.size > L.end
          ? `Round the size up to a multiple of ${L.K}: pad ${L.size - L.end}`
          : `${L.size} B is already a multiple of ${L.K}`;

  // code line, with the current field's declaration highlighted
  const decls: { text: string; names: string[] }[] = [];
  for (const p of L.placed) {
    const lastD = decls[decls.length - 1];
    if (lastD && lastD.text === p.decl) lastD.names.push(p.name);
    else decls.push({ text: p.decl, names: [p.name] });
  }

  // alignment marks: every 4 bytes, taller every 8
  const ticks = Array.from(
    { length: Math.floor(maxBytes / 4) + 1 },
    (_, i) => i * 4,
  );
  const pads: { at: number; len: number; key: string }[] = [];
  for (const p of shown)
    if (p.pad)
      pads.push({ at: p.off - p.pad, len: p.pad, key: `pad-${p.name}` });
  if (done && L.size > L.end)
    pads.push({ at: L.end, len: L.size - L.end, key: "pad-end" });

  // array of structs
  const ARR_Y = ROW_Y + ROW_H + 74;
  const show = Math.min(array, 3);
  const acw = array ? Math.min(cw, (W - X0 - 60) / (maxBytes * show)) : 0;
  const H = array ? ARR_Y + 58 : ROW_Y + ROW_H + 52;

  return (
    <div className={`not-content ${s.root}`} {...stepper.keyProps}>
      <StepControls stepper={stepper} counter={`step ${step} / ${n + 1}`}>
        {structs.length > 1 && (
          <div className={s.seg} role="group" aria-label="Struct">
            {structs.map((ss, i) => (
              <button
                key={ss.label}
                className={`viz-btn ${i === vi ? s.on : ""}`}
                aria-pressed={i === vi}
                onClick={() => setVi(i)}
              >
                {ss.label}
              </button>
            ))}
          </div>
        )}
      </StepControls>

      <pre className={s.code}>
        {st.code ?? (
          <>
            struct {st.name ?? "S"} {"{ "}
            {decls.map((d) => (
              <span
                key={d.text}
                className={cur && d.names.includes(cur.name) ? s.codeNow : ""}
              >
                {d.text};{" "}
              </span>
            ))}
            {"}"}
          </>
        )}
      </pre>
      <p className={s.msg}>{msg}</p>

      <div className={s.scroll}>
        <svg
          className={s.svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Struct layout in bytes"
        >
          <defs>
            <pattern
              id="sl-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" className={s.hatchBg} />
              <line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine} />
            </pattern>
          </defs>

          {/* empty byte cells */}
          {Array.from({ length: maxBytes }, (_, b) => (
            <rect
              key={b}
              className={`${s.byte} ${b < L.size ? "" : s.byteOut}`}
              x={x(b)}
              y={ROW_Y}
              width={cw}
              height={ROW_H}
            />
          ))}
          {/* alignment boundaries */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                className={t % 8 === 0 ? s.tick8 : s.tick4}
                x1={x(t)}
                x2={x(t)}
                y1={ROW_Y - (t % 8 === 0 ? 10 : 5)}
                y2={ROW_Y + ROW_H + (t % 8 === 0 ? 10 : 5)}
              />
              <text
                className={s.off}
                x={x(t)}
                y={ROW_Y + ROW_H + 24}
                textAnchor="middle"
              >
                {base}+{t}
              </text>
            </g>
          ))}

          {pads.map((p) => (
            <rect
              key={p.key}
              className={s.pad}
              x={x(p.at)}
              y={ROW_Y}
              width={p.len * cw}
              height={ROW_H}
              fill="url(#sl-hatch)"
            />
          ))}

          {/* fields slide to their offsets */}
          {L.placed.map((p, i) => (
            <g
              key={p.name}
              className={`${s.field} ${i < step ? "" : s.hidden} ${cur?.name === p.name ? s.fieldNow : ""}`}
              style={{ transform: `translateX(${x(p.off)}px)` }}
            >
              <rect
                x={1}
                y={ROW_Y + 1}
                width={p.size * cw - 2}
                height={ROW_H - 2}
                rx={4}
              />
              <text
                x={(p.size * cw) / 2}
                y={ROW_Y + ROW_H / 2 + 4.5}
                textAnchor="middle"
              >
                {p.size * cw >= p.name.length * 7.5 + 4
                  ? p.name
                  : p.name.slice(0, 1)}
              </text>
            </g>
          ))}

          {/* size bar */}
          <g
            className={s.sizeBar}
            style={{ transform: `translateY(${ROW_Y + ROW_H + 34}px)` }}
          >
            <rect
              className={s.sizeFill}
              x={x(0)}
              y={0}
              width={cw}
              height={8}
              rx={2}
              style={{ transform: `scaleX(${Math.max(filled, 0.001)})` }}
            />
            <text className={s.sizeText} x={x(maxBytes) + 10} y={8}>
              {filled} B
              {padTotal > 0 && (
                <tspan className={s.padText}> ({padTotal} B padding)</tspan>
              )}
            </text>
          </g>

          {array > 0 && (
            <g>
              <text className={s.arrTitle} x={X0} y={ARR_Y - 14}>
                a[{array}]: each element is {done ? L.size : "?"} B
              </text>
              {Array.from({ length: show }, (_, e) => {
                const ex = X0 + e * L.size * acw;
                return (
                  <g
                    key={e}
                    className={s.elem}
                    style={{ transform: `translateX(${ex}px)` }}
                  >
                    <rect
                      className={s.elemBox}
                      x={0}
                      y={ARR_Y}
                      width={L.size * acw}
                      height={22}
                      fill="url(#sl-hatch)"
                    />
                    {done &&
                      L.placed.map((p) => (
                        <rect
                          key={p.name}
                          className={s.elemField}
                          x={p.off * acw + 1}
                          y={ARR_Y + 2}
                          width={p.size * acw - 2}
                          height={18}
                          rx={2}
                        />
                      ))}
                    <text
                      className={s.off}
                      x={0}
                      y={ARR_Y + 38}
                      textAnchor="middle"
                    >
                      a+{e * L.size}
                    </text>
                    <text
                      className={s.elemName}
                      x={(L.size * acw) / 2}
                      y={ARR_Y + 52}
                      textAnchor="middle"
                    >
                      a[{e}]
                    </text>
                  </g>
                );
              })}
              <text
                className={s.off}
                x={X0 + show * L.size * acw}
                y={ARR_Y + 38}
                textAnchor="middle"
                style={{ transition: "x 600ms" }}
              >
                a+{show * L.size}
              </text>
              <text
                className={s.dots}
                x={X0 + show * L.size * acw + 26}
                y={ARR_Y + 16}
              >
                …
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className={s.legend}>
        <span>
          <i className={s.swField} /> field
        </span>
        <span>
          <i className={s.swNow} /> placing now
        </span>
        <span>
          <i className={s.swPad} /> padding
        </span>
        <span>
          <i className={s.swTick} /> multiple of 4 / 8
        </span>
        <span className={s.unit}>1 cell = 1 byte</span>
      </div>
    </div>
  );
}
