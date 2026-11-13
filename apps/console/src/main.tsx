import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { Providers } from "./ask.tsx";
import { applyThemeChoice } from "./theme.ts";
import "./styles.css";

applyThemeChoice();

createRoot(document.getElementById("app") as HTMLElement).render(
  <Providers>
    <App />
  </Providers>,
);
