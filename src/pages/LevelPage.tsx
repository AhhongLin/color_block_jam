import { Link, useParams } from "react-router-dom";
import { levels } from "../data/levels";
import { markLevelCompleted } from "../game/progress";
import { playSound } from "../audio/sound";
import { Board } from "../components/Board/Board";
import styles from "./LevelPage.module.css";

export function LevelPage() {
  const { id } = useParams<{ id: string }>();
  const level = levels.find((candidate) => candidate.id === id);

  function handleComplete() {
    if (level) markLevelCompleted(window.localStorage, level.id);
  }

  if (!level) {
    return <p>找不到這個關卡。</p>;
  }

  return (
    <Board
      key={level.id}
      level={level}
      onComplete={handleComplete}
      backLink={
        <Link to="/" className={styles.backLink} onClick={() => playSound("click")}>
          ← 選單
        </Link>
      }
    />
  );
}
