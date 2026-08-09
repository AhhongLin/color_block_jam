import { useParams } from "react-router-dom";
import { levels } from "../data/levels";
import { Board } from "../components/Board/Board";

export function LevelPage() {
  const { id } = useParams<{ id: string }>();
  const level = levels.find((candidate) => candidate.id === id);

  if (!level) {
    return <p>找不到這個關卡。</p>;
  }

  return <Board key={level.id} level={level} />;
}
