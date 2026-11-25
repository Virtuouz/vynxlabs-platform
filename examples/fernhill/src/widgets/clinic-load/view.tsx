import { createFrame } from "@volvel/widget-frame";
import { useWidgetProps } from "@volvel/widget-frame/react";
import { createRoot } from "react-dom/client";

type Config = { clinic: string; perHour: number; busyAt: number; fullAt: number };

// Only the events the definition declares can be raised.
const frame = createFrame<Config>({ events: ["clinicChosen"] });

const minutes = (time: unknown) => {
  const [hours, mins] = String(time).split(":").map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
};

function View() {
  const props = useWidgetProps(frame);
  if (!props) return null;
  const { config, data, state } = props;
  if (state.status !== "ready") {
    return (
      <p style={{ margin: 8 }}>{state.status === "loading" ? "Loading" : "No visits to show."}</p>
    );
  }
  const visits = data.visits?.shape === "summary" ? data.visits : undefined;
  const clinics = data.clinics?.shape === "rows" ? data.clinics : undefined;
  const clinic = clinics?.rows.find((row) => row.code === config.clinic);
  if (!clinic) {
    return <p style={{ margin: 8 }}>No clinic has the code "{config.clinic}".</p>;
  }
  const row = visits?.rows.find((candidate) => candidate.clinic === config.clinic);
  const booked = Number(row?.visits ?? 0);
  const capacity = Math.max(
    1,
    Math.round(((minutes(clinic.closes) - minutes(clinic.opens)) / 60) * config.perHour),
  );
  const share = booked / capacity;
  const percent = Math.round(share * 100);
  const tone =
    percent >= config.fullAt ? "danger" : percent >= config.busyAt ? "attention" : "success";
  return (
    <>
      <style>
        {"button:focus-visible{outline:2px solid var(--volvel-focus);outline-offset:-3px}"}
      </style>
      <button
        type="button"
        onClick={() => frame.emit("clinicChosen", { group: { clinic: config.clinic } })}
        aria-label={`${clinic.name}: ${booked} of ${capacity} visits today, ${percent}%. Show this clinic.`}
        style={{
          all: "unset",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          height: "100%",
          padding: 12,
          cursor: "pointer",
          fontFamily: "var(--volvel-font, system-ui)",
          color: "var(--volvel-ink)",
        }}
      >
        <span style={{ color: "var(--volvel-ink-muted)", fontSize: 13 }}>
          {String(clinic.name)}
        </span>
        <span style={{ fontSize: 28, fontWeight: 600 }}>
          {booked} <span style={{ fontSize: 14, fontWeight: 400 }}>of {capacity} visits today</span>
        </span>
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, percent)}
          aria-label="Share of capacity"
          style={{
            display: "block",
            height: 10,
            borderRadius: 5,
            background: "var(--volvel-sunken)",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              display: "block",
              height: "100%",
              width: `${Math.min(100, percent)}%`,
              background: `var(--volvel-${tone})`,
            }}
          />
        </span>
        <span style={{ fontSize: 13, color: `var(--volvel-${tone})` }}>
          {percent}% of capacity
          {tone === "danger" ? ", full" : tone === "attention" ? ", busy" : ""}
        </span>
      </button>
    </>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<View />);
