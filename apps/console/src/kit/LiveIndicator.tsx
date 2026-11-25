import { RefreshCw, WifiOff } from "lucide-react";
import { useStreamStatus } from "../stream.ts";
import { hm } from "./format.ts";
import { Junction } from "./motifs.tsx";

/**
 * Whether what the page shows is current: Live while run events arrive,
 * Reconnecting… after a few seconds without them, and Offline with the time it
 * was last current once they have been gone for long. Read out only when it changes.
 */
export function LiveIndicator() {
  const { status, lastLiveAt } = useStreamStatus();
  const words =
    status === "live"
      ? "Live"
      : status === "connecting"
        ? "Connecting…"
        : status === "reconnecting"
          ? "Reconnecting…"
          : status === "offline"
            ? `Offline${lastLiveAt ? ` · last updated ${hm(lastLiveAt)}` : ""}`
            : "";
  return (
    <span
      role="status"
      aria-live="polite"
      // Says how the connection stands, which pictures of a screen leave out.
      data-volatile
      className={`hidden items-center gap-1.5 text-meta whitespace-nowrap sm:flex ${
        status === "offline" ? "text-attention" : "text-ink-muted"
      }`}
      title={
        status === "live"
          ? "Runs and lists update as they change."
          : status === "idle"
            ? undefined
            : "What is shown may be out of date. It is read again as soon as the connection is back."
      }
    >
      {status === "live" ? (
        <Junction kind="here" size={5} />
      ) : status === "reconnecting" || status === "connecting" ? (
        <RefreshCw aria-hidden="true" size={14} className="animate-spin" />
      ) : status === "offline" ? (
        <WifiOff aria-hidden="true" size={14} />
      ) : null}
      {status === "live" ? <span className="max-xl:sr-only">{words}</span> : words}
    </span>
  );
}
