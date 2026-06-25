import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import App from "@/App.tsx";

// Apply the saved theme before first paint (default = light) to avoid a flash.
try {
  if (localStorage.getItem("tier-list:theme") === "dark") {
    document.documentElement.classList.add("dark");
  }
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
