// A 4-byte int at a movable start address: how many cache blocks and CPU words does reading it touch?
// Misaligned, it can straddle a word boundary (two reads) or even a cache block boundary (two blocks).
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import s from "./MisalignedRead.module.css";

interface Props {
  /** Address of the first byte drawn. */
  from?: number;
  /** Bytes drawn. */
  bytes?: number;
  /** Initial start address of the value. */
  start?: number;
  /** Size of the value in bytes. */
  size?: number;
  /** CPU word size in bytes. */
  word?: number;
  /** Cache block size in bytes. */
  block?: number;
}

const W = 680;
const X0 = 20;
const ROW_Y = 54;
const ROW_H = 36;
const hex = (a: number) => `0x${a.toString(16)}`;

export default function MisalignedRead({
  from = 0x923d36,
  bytes = 16,
  start = 0x923d3f,
  size = 4,
  word = 4,
  block = 64,
}: Props) {
  const [at, setAt] = useState(start);
  const min = from;
  const max = from + bytes - size;
  const cw = (W - X0 * 2) / bytes;
  const x = (a: number) => X0 + (a - from) * cw;
  const end = at + size - 1;
  const blk = (a: number) => Math.floor(a / block) * block;
  const wrd = (a: number) => Math.floor(a / word) * word;
  const blocks = [...new Set([blk(at), blk(end)])];
  const words = [
    ...new Set(Array.from({ length: size }, (_, i) => wrd(at + i))),
  ];
  const aligned = at % word === 0;
  const lowBits = Math.log2(word);
  const bin = (at & 0xff).toString(2).padStart(8, "0");

  // cache blocks visible in the window
  const visBlocks: number[] = [];
  for (let b = blk(from); b < from + bytes; b += block) visBlocks.push(b);

  return (
    <div className={`not-content ${s.root}`}>
      <div className={`viz-controls ${s.controls}`}>
        <button
          onClick={() => setAt((a) => Math.max(min, a - 1))}
          disabled={at <= min}
          aria-label="Earlier"
        >
          <ChevronLeft size={15} />
          <span>Earlier</span>
        </button>
        <input
          className={s.slider}
          type="range"
          min={min}
          max={max}
          value={at}
          onChange={(e) => setAt(Number(e.target.value))}
          aria-label="Start address"
          aria-valuetext={hex(at)}
        />
        <button
          onClick={() => setAt((a) => Math.min(max, a + 1))}
          disabled={at >= max}
          aria-label="Later"
        >
          <span>Later</span>
          <ChevronRight size={15} />
        </button>
        <button
          className={at === start ? s.on : ""}
          onClick={() => setAt(start)}
        >
          {hex(start)}
        </button>
        <button
          className={at === wrd(start + word) ? s.on : ""}
          onClick={() => setAt(wrd(start + word))}
        >
          {hex(wrd(start + word))}
        </button>
      </div>

      <div className={s.readout}>
        <span className={s.addr}>
          start {hex(at)} = …{bin.slice(0, 4)} {bin.slice(4, 8 - lowBits)}
          <b className={aligned ? s.good : s.bad}>{bin.slice(8 - lowBits)}</b>
        </span>
        <span
          className={`${s.count} ${blocks.length > 1 ? s.countBad : s.countGood}`}
        >
          cache blocks <b>{blocks.length}</b>
        </span>
        <span
          className={`${s.count} ${words.length > 1 ? s.countBad : s.countGood}`}
        >
          word reads <b>{words.length}</b>
        </span>
      </div>

      <div className={s.scroll}>
        <svg
          className={s.svg}
          viewBox={`0 0 ${W} 150`}
          role="img"
          aria-label="A 4-byte value across word and cache block boundaries"
        >
          {/* cache blocks */}
          {visBlocks.map((b) => {
            const x1 = Math.max(x(from) - 8, x(b));
            const x2 = Math.min(x(from + bytes) + 8, x(b + block));
            const hit = blocks.includes(b);
            return (
              <g key={b} className={`${s.cblock} ${hit ? s.cblockHit : ""}`}>
                <rect
                  x={x1}
                  y={8}
                  width={x2 - x1}
                  height={ROW_Y + ROW_H - 2}
                  rx={5}
                />
                <text x={x(Math.max(b, from)) + 6} y={24}>
                  cache block {hex(b)}
                </text>
              </g>
            );
          })}

          {/* bytes */}
          {Array.from({ length: bytes }, (_, i) => {
            const a = from + i;
            const inVal = a >= at && a <= end;
            return (
              <g key={a}>
                <rect
                  className={`${s.byte} ${inVal ? s.byteVal : ""}`}
                  x={x(a)}
                  y={ROW_Y}
                  width={cw}
                  height={ROW_H}
                />
                {a % word === 0 && (
                  <text
                    className={s.addrLabel}
                    x={x(a)}
                    y={ROW_Y + ROW_H + 15}
                    textAnchor="middle"
                  >
                    …{(a & 0xff).toString(16)}
                  </text>
                )}
              </g>
            );
          })}
          {/* the value, sliding along */}
          <g className={s.val} style={{ transform: `translateX(${x(at)}px)` }}>
            <rect
              x={1.5}
              y={ROW_Y + 1.5}
              width={size * cw - 3}
              height={ROW_H - 3}
              rx={4}
            />
            <text
              x={(size * cw) / 2}
              y={ROW_Y + ROW_H / 2 + 5}
              textAnchor="middle"
            >
              int
            </text>
          </g>

          {/* word boundaries and block boundary */}
          {Array.from({ length: bytes + 1 }, (_, i) => from + i)
            .filter((a) => a % word === 0)
            .map((a) => (
              <line
                key={a}
                className={a % block === 0 ? s.blockLine : s.wordLine}
                x1={x(a)}
                x2={x(a)}
                y1={ROW_Y - (a % block === 0 ? 46 : 4)}
                y2={ROW_Y + ROW_H + 4}
              />
            ))}

          {/* words the CPU has to read */}
          {Array.from(
            { length: Math.ceil(bytes / word) + 1 },
            (_, i) => wrd(from) + i * word,
          )
            .filter((w) => w + word > from && w < from + bytes)
            .map((w) => {
              const x1 = Math.max(x(w), x(from));
              const x2 = Math.min(x(w + word), x(from + bytes));
              const hit = words.includes(w);
              return (
                <g key={w} className={`${s.word} ${hit ? s.wordHit : ""}`}>
                  <rect
                    x={x1 + 2}
                    y={ROW_Y + ROW_H + 24}
                    width={x2 - x1 - 4}
                    height={10}
                    rx={3}
                  />
                </g>
              );
            })}
          <text className={s.rowLabel} x={X0} y={ROW_Y + ROW_H + 50}>
            words read
          </text>
        </svg>
      </div>

      <div className={s.legend}>
        <span>
          <i className={s.swVal} /> the int
        </span>
        <span>
          <i className={s.swHit} /> touched by the read
        </span>
        <span>
          <i className={s.swWord} /> word boundary
        </span>
        <span>
          <i className={s.swBlock} /> cache block boundary
        </span>
        <span className={s.unit}>1 cell = 1 byte, addresses in hex</span>
      </div>
    </div>
  );
}
