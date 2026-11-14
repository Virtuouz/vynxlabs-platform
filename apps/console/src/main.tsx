import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { Providers } from "./ask.tsx";
import { BrandProvider } from "./kit/brand.tsx";
import { applyThemeChoice, loadInstanceTheme } from "./theme.ts";
import "./styles.css";

applyThemeChoice();
loadInstanceTheme();

createRoot(document.getElementById("app") as HTMLElement).render(
  <Providers>
    <BrandProvider>
      <App />
    </BrandProvider>
  </Providers>,
);
