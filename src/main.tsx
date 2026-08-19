import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { basePath, restoreDeepLink } from "./launch/launchPath";
import "./index.css";

// 深層連結是被 404.html 接住、暫存、跳回 base 才來到這裡的（見 launchPath.ts）。
// 一定要在 createRoot() 之前把網址還原回去——BrowserRouter 是 render 當下才讀
// location，早一步還原就來得及，React 完全不會看到中途那個 base 網址。
restoreDeepLink(window.sessionStorage, window.location, window.history);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basePath()}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
