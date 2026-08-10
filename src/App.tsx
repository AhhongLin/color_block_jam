import { Route, Routes } from "react-router-dom";
import { LevelPage } from "./pages/LevelPage";
import { LevelSelect } from "./pages/LevelSelect/LevelSelect";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LevelSelect />} />
      <Route path="/level/:id" element={<LevelPage />} />
    </Routes>
  );
}
