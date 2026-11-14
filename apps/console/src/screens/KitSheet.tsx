import { Button, Notice } from "@vynxlabs/ui";
import { GitCompareArrows } from "lucide-react";
import { useState } from "react";
import {
  EmptyCanvas,
  FilterChips,
  KeyValues,
  NextStep,
  PageHeader,
  Panel,
  SectionLabel,
  Stepper,
} from "../kit/layout.tsx";
import { InsetRule, JunctionList, PortBrackets, SignalPath } from "../kit/motifs.tsx";
import { EnvTag, StatePill, Tag } from "../kit/status.tsx";

const SWATCHES = [
  "canvas",
  "structure",
  "surface",
  "raised",
  "selected",
  "sunken",
  "line",
  "line-strong",
  "ink",
  "ink-muted",
  "ink-subtle",
  "action",
  "action-soft",
  "attention",
  "danger",
  "success",
  "code-bg",
  "focus",
];

/** Every token, type role, motif and state of the console's kit, as this instance themes them. */
export function KitSheet() {
  const [chip, setChip] = useState("all");
  const [stage, setStage] = useState("review");
  return (
    <div className="flex flex-col gap-9">
      <PageHeader
        eyebrow="Instance"
        title="Component kit"
        description="The console's parts as this instance draws them, in whichever theme is on. A reference for anyone changing the console or its branding."
      />

      <section className="flex flex-col gap-3">
        <SectionLabel>Tokens</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SWATCHES.map((token) => (
            <div key={token} className="flex flex-col gap-1.5">
              <span
                className="h-12 rounded-control border border-line"
                style={{ background: `var(--vx-${token})` }}
              />
              <code className="font-mono text-tag text-ink-muted">{token}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Type roles</SectionLabel>
        <Panel className="flex flex-col gap-3 p-4">
          <p className="m-0 text-display">Display — a screen's title</p>
          <p className="m-0 text-title">Title — a section or an inspector</p>
          <p className="m-0 text-body">Body — what people read, at 14px.</p>
          <p className="m-0 text-label text-ink-subtle uppercase">Label — a group's heading</p>
          <p className="m-0 text-meta text-ink-muted">Meta — when, who, and how long</p>
          <p className="m-0 font-mono text-telemetry">telemetry · run_8812 · 2.41s · v14</p>
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Motifs</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="flex flex-col gap-3 p-4">
            <span className="text-meta text-ink-subtle">
              Signal path: where you are and where it goes
            </span>
            <SignalPath
              steps={[
                { key: "t", label: "Acme", kind: "plain" },
                { key: "w", label: "Orders dev", kind: "here" },
                { key: "p", label: "Orders production", kind: "production", loose: true },
              ]}
            />
          </Panel>
          <Panel className="flex flex-col gap-3 p-4">
            <span className="text-meta text-ink-subtle">Port brackets: the one chosen object</span>
            <PortBrackets className="w-fit">
              <div className="rounded-control border border-action bg-raised px-3 py-2">
                Send to ERP
              </div>
            </PortBrackets>
          </Panel>
          <Panel className="flex flex-col gap-3 p-4">
            <span className="text-meta text-ink-subtle">Inset rule: an inspector's heading</span>
            <div className="flex flex-col gap-1">
              <InsetRule />
              <span className="text-title">orders/sync</span>
            </div>
          </Panel>
          <Panel className="flex flex-col gap-3 p-4">
            <span className="text-meta text-ink-subtle">Junctions: an ordered history</span>
            <JunctionList
              items={[
                { key: "1", kind: "pending", content: "Draft · 3 changes" },
                { key: "2", kind: "here", content: "Dev · v14" },
                { key: "3", kind: "production", content: "Production · v13" },
              ]}
            />
          </Panel>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>State and environment</SectionLabel>
        <Panel className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-5">
            <StatePill state="succeeded" />
            <StatePill state="failed" />
            <StatePill state="running" />
            <StatePill state="waiting" />
            <StatePill state="paused" />
            <StatePill state="retired" />
          </div>
          <div className="flex flex-wrap gap-2">
            <EnvTag type="dev" />
            <EnvTag type="production" />
            <Tag tone="draft">Draft</Tag>
            <Tag tone="repository">From repository</Tag>
            <Tag tone="live">Live</Tag>
          </div>
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Actions</SectionLabel>
        <Panel className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button variant="quiet">Quiet</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="promote">Promote to production</Button>
          </div>
          <p className="m-0 text-meta text-ink-muted">
            One primary per screen. The amber button is kept for the one action that changes
            production.
          </p>
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Narrowing, stages and facts</SectionLabel>
        <Panel className="flex flex-col gap-5 p-4">
          <FilterChips
            label="Status"
            value={chip}
            onChange={setChip}
            options={[
              { value: "all", label: "All", count: 128 },
              { value: "failed", label: "Failed", count: 4 },
              { value: "waiting", label: "Waiting", count: 1 },
            ]}
          />
          <Stepper
            current={stage}
            onChoose={setStage}
            steps={[
              { key: "review", label: "Review draft", detail: "3 changes" },
              { key: "deploy", label: "Deploy to dev", detail: "v14 → v15" },
              { key: "promote", label: "Promote to production", detail: "v13 → v15" },
            ]}
          />
          <KeyValues
            rows={[
              { label: "Timeout", value: "120s", mono: true },
              { label: "Retries", value: "3 × 30s", mono: true },
              { label: "On failure", value: "alerts/run-failed", mono: true },
            ]}
          />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Status with a next step</SectionLabel>
        <Panel>
          <NextStep
            icon={<GitCompareArrows aria-hidden="true" size={15} />}
            title="3 drafts not deployed"
            detail="Saved here, and not yet running."
            action={<Button size="small">Review</Button>}
          />
        </Panel>
        <Notice tone="attention">A caution sits inline, with what to do about it.</Notice>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Empty canvas</SectionLabel>
        <EmptyCanvas
          title="No flows yet"
          text="A flow joins scripts and decisions into one process that a schedule, a webhook or an event starts."
          action={<Button variant="primary">New flow</Button>}
        />
      </section>
    </div>
  );
}
