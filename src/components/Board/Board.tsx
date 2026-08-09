import { Fragment, type CSSProperties } from "react";
import type { Level, Side } from "../../types/level";
import styles from "./Board.module.css";

interface BoardProps {
  level: Level;
}

function cellKey(row: number, col: number) {
  return `${row},${col}`;
}

const DOOR_STYLE_BY_SIDE: Record<Side, Pick<CSSProperties, "alignSelf" | "justifySelf" | "width" | "height">> = {
  top: { alignSelf: "start", justifySelf: "center", width: "70%", height: "14%" },
  bottom: { alignSelf: "end", justifySelf: "center", width: "70%", height: "14%" },
  left: { alignSelf: "center", justifySelf: "start", width: "14%", height: "70%" },
  right: { alignSelf: "center", justifySelf: "end", width: "14%", height: "70%" },
};

// Static rendering only — no drag/slide interaction yet (see ticket 08).
export function Board({ level }: BoardProps) {
  const floorSet = new Set(level.cells.map(([r, c]) => cellKey(r, c)));
  const maxRow = Math.max(...level.cells.map(([r]) => r));
  const maxCol = Math.max(...level.cells.map(([, c]) => c));
  const rows = maxRow + 1;
  const cols = maxCol + 1;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{level.name}</h1>
      <div
        className={styles.board}
        style={{
          gridTemplateColumns: `repeat(${cols}, var(--cell-size))`,
          gridTemplateRows: `repeat(${rows}, var(--cell-size))`,
        }}
      >
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => (
            <div
              key={cellKey(r, c)}
              className={floorSet.has(cellKey(r, c)) ? styles.floor : styles.hole}
              style={{ gridRow: r + 1, gridColumn: c + 1 }}
            />
          )),
        )}

        {level.doors.map((door) => (
          <div
            key={`door-${door.row}-${door.col}`}
            data-door-color={door.color}
            className={`${styles.door} ${styles[door.color]}`}
            style={{
              gridRow: door.row + 1,
              gridColumn: door.col + 1,
              ...DOOR_STYLE_BY_SIDE[door.side],
            }}
          />
        ))}

        {level.blocks.map((block) => (
          <Fragment key={block.id}>
            {block.cells.map(([r, c]) => (
              <div
                key={`${block.id}-${cellKey(r, c)}`}
                data-block-id={block.id}
                className={`${styles.block} ${styles[block.color]}`}
                style={{ gridRow: r + 1, gridColumn: c + 1 }}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
