import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { useFileDrop } from "./workspace/useFileDrop";

function Root() {
  useFileDrop();
  return (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <Root />,
);
