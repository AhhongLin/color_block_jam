import { Navigate, Route, Routes } from "react-router-dom";
import { LevelPage } from "./pages/LevelPage";
import { sampleLevel } from "./data/levels";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/level/${sampleLevel.id}`} replace />} />
      <Route path="/level/:id" element={<LevelPage />} />
    </Routes>
  );
}
