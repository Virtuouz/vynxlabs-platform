import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { Providers } from "./ask.tsx";
import "./styles.css";

createRoot(document.getElementById("app") as HTMLElement).render(
  <Providers>
    <App />
  </Providers>,
);
