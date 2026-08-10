import { useState } from "react";
import { Link } from "react-router-dom";
import { levels } from "../../data/levels";
import { isLevelUnlocked, readCompletedLevelIds } from "../../game/progress";
import { playSound } from "../../audio/sound";
import styles from "./LevelSelect.module.css";

// 路徑地圖排版用固定的行高，配合下面的 sine 波動算出每個節點的 x 座標
// （spec.md 4.3：圓形關卡節點沿蜿蜒路徑排列），節點數量不固定（之後關卡會
// 陸續加進 data/levels.ts），公式對任意關卡數都成立，不需要手動排版。
const ROW_HEIGHT = 120;
const NODE_SIZE = 76;
const CENTER_X = 50;
const WAVE_AMPLITUDE_X = 30;

function nodeCenter(index: number): { xPercent: number; y: number } {
  return {
    xPercent: CENTER_X + Math.sin(index * 0.9) * WAVE_AMPLITUDE_X,
    y: index * ROW_HEIGHT + ROW_HEIGHT / 2,
  };
}

function pathPoints(count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const { xPercent, y } = nodeCenter(i);
    return `${xPercent}%,${y}`;
  }).join(" ");
}

export function LevelSelect() {
  const [completedIds] = useState(() => readCompletedLevelIds(window.localStorage));
  const mapHeight = levels.length * ROW_HEIGHT;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Color Block Jam</h1>

      <div className={styles.map} style={{ height: mapHeight }}>
        <svg className={styles.pathLine} viewBox={`0 0 100 ${mapHeight}`} preserveAspectRatio="none">
          <polyline points={pathPoints(levels.length)} fill="none" />
        </svg>

        {levels.map((level, index) => {
          const unlocked = isLevelUnlocked(index, levels, completedIds);
          const completed = completedIds.has(level.id);
          const { xPercent, y } = nodeCenter(index);
          const style = {
            left: `${xPercent}%`,
            top: y,
            width: NODE_SIZE,
            height: NODE_SIZE,
          };

          if (!unlocked) {
            return (
              <div
                key={level.id}
                className={`${styles.node} ${styles.locked}`}
                style={style}
                aria-disabled="true"
                aria-label={`${level.name}（未解鎖）`}
                data-level-id={level.id}
              >
                <span className={styles.lockIcon}>🔒</span>
              </div>
            );
          }

          return (
            <Link
              key={level.id}
              to={`/level/${level.id}`}
              className={`${styles.node} ${completed ? styles.completed : ""}`}
              style={style}
              aria-label={`${level.name}${completed ? "（已完成）" : ""}`}
              data-level-id={level.id}
              onClick={() => playSound("click")}
            >
              {completed ? <span className={styles.completeIcon}>✓</span> : <span className={styles.nodeIndex}>{index + 1}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
