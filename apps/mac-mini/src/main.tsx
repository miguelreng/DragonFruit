import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// eslint-disable-next-line import/no-unassigned-import
import "../../../packages/tailwind-config/scoped-themes.css";
// eslint-disable-next-line import/no-unassigned-import
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
