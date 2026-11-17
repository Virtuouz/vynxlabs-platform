import { LucideProvider } from "lucide-react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { Providers } from "./ask.tsx";
import { BrandProvider } from "./kit/brand.tsx";
import { ErrorBoundary } from "./kit/ErrorBoundary.tsx";
import { applyThemeChoice, loadInstanceTheme } from "./theme.ts";
import "./styles.css";

applyThemeChoice();
loadInstanceTheme();

createRoot(document.getElementById("app") as HTMLElement).render(
  // Every icon in the console is drawn with one stroke.
  <LucideProvider strokeWidth={1.75}>
    <Providers>
      <ErrorBoundary what="The console">
        <BrandProvider>
          <App />
        </BrandProvider>
      </ErrorBoundary>
    </Providers>
  </LucideProvider>,
);
