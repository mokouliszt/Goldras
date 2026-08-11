import "./lib/polyfills";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initViewport } from "./lib/viewport";

initViewport();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
