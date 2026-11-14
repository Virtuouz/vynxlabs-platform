import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useLoad } from "../api.ts";

export interface Branding {
  productName: string;
  /** Whether the operator named the console, or the name is the default. */
  named: boolean;
  logo: boolean;
  theme: { tokens: Record<string, string>; dark: Record<string, string> };
}

const DEFAULT: Branding = {
  productName: "Vynxlabs",
  named: false,
  logo: false,
  theme: { tokens: {}, dark: {} },
};

interface BrandState extends Branding {
  /** Changes when the logo does, so that a new one is fetched. */
  logoVersion: number;
  reload: () => void;
}

const BrandContext = createContext<BrandState>({ ...DEFAULT, logoVersion: 0, reload: () => {} });

/** The instance's name and logo for the console, fetched once for every screen. */
export function BrandProvider({ children }: { children: ReactNode }) {
  const loaded = useLoad<Branding>("/instance/branding");
  const [logoVersion, setLogoVersion] = useState(0);
  const value = useMemo<BrandState>(
    () => ({
      ...DEFAULT,
      ...loaded.data,
      logoVersion,
      reload: () => {
        setLogoVersion((version) => version + 1);
        loaded.reload();
      },
    }),
    [loaded.data, loaded.reload, logoVersion],
  );
  useEffect(() => {
    document.title = value.productName;
  }, [value.productName]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);

/** Two letters for the mark when there is no logo: the initials of two words, or the first two letters. */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}` : name.trim().slice(0, 2);
  return letters.toLowerCase() || "?";
}

/**
 * The instance's mark: its logo when one is set, otherwise its initials on the
 * accent colour, cut at one corner like a port.
 */
export function BrandMark({ size = 32 }: { size?: 24 | 30 | 32 }) {
  const brand = useBrand();
  const box = size === 24 ? "size-6" : size === 30 ? "size-[30px]" : "size-8";
  if (brand.logo) {
    return (
      <img
        src={`/api/v1/instance/branding/logo?v=${brand.logoVersion}`}
        alt={brand.productName}
        className={`${box} shrink-0 object-contain`}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={brand.productName}
      className={`vx-port flex ${box} shrink-0 items-center justify-center bg-action font-mono text-label font-bold tracking-tight text-action-ink`}
    >
      {monogram(brand.productName)}
    </span>
  );
}
