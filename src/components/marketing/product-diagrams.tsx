import { ArrowRight, Bot, Film, Hash, Megaphone, MessageSquare, Sparkles } from "lucide-react";
import type { ProductSection } from "./content";

/**
 * Non-numeric illustrations of the product's screens, drawn with the
 * dashboard tokens. They show structure only: no metrics, names, faces or
 * performance (production-ui-plan.md "Asset requirements and provenance").
 */
export function ProductDiagram({ id }: { id: ProductSection["id"] }) {
  switch (id) {
    case "playbooks":
      return <PlaybookDiagram />;
    case "analytics":
      return <AnalyticsDiagram />;
    case "posts-to-ads":
      return <PostsToAdsDiagram />;
    case "ai-agent":
      return <AgentDiagram />;
  }
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-[14px] border border-white/10 bg-canvas text-ink shadow-2xl shadow-black/50">
      <div className="flex items-center gap-1.5 border-b border-line bg-surface px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="ml-3 text-xs font-medium text-muted">{title}</span>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
      <figcaption className="border-t border-line bg-surface px-4 py-2 text-[11px] text-muted">Illustration of the interface. Not real data.</figcaption>
    </figure>
  );
}

/** Grey bar standing in for text. */
function Line({ w, tone = "bg-line" }: { w: string; tone?: string }) {
  return <span className={`block h-2 rounded-full ${tone}`} style={{ width: w }} />;
}

function PlaybookDiagram() {
  const scenes = [
    { label: "Hook", icon: Sparkles },
    { label: "Show the product", icon: Film },
    { label: "Call to action", icon: Megaphone },
  ];
  return (
    <Frame title="Playbook editor">
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <ol className="flex flex-col gap-2" aria-label="Scenes">
          {scenes.map((scene, i) => (
            <li
              key={scene.label}
              className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[13px] ${i === 0 ? "border-ink bg-surface font-medium" : "border-line bg-surface text-ink-2"}`}
            >
              <scene.icon className="size-3.5 shrink-0" aria-hidden="true" />
              {scene.label}
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface p-4">
          <p className="text-[13px] font-medium">Scene direction</p>
          <div className="flex flex-col gap-2">
            <Line w="92%" />
            <Line w="78%" />
            <Line w="64%" />
          </div>
          <p className="mt-1 text-[13px] font-medium">Reference video</p>
          <div className="flex gap-2">
            <span className="grid aspect-[9/16] w-16 place-items-center rounded-[8px] bg-selected">
              <Film className="size-4 text-muted" aria-hidden="true" />
            </span>
            <span className="aspect-[9/16] w-16 rounded-[8px] border border-dashed border-line-strong" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Hash className="size-3.5 text-muted" aria-hidden="true" />
            <span className="rounded-full bg-selected px-2 py-0.5 text-[11px] text-ink-2">primary hashtag</span>
            <span className="rounded-full bg-selected px-2 py-0.5 text-[11px] text-ink-2">description</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function AnalyticsDiagram() {
  const columns = ["Campaign", "Views", "Posts", "Creators", "CPM"];
  return (
    <Frame title="Organic reporting">
      <div className="flex flex-col gap-4">
        <div className="rounded-[12px] border border-line bg-surface p-4">
          <div className="mb-3 flex items-center gap-4 text-[12px] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-ink" /> Organic views
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-accent" /> Ad impressions
            </span>
            <span className="ml-auto text-muted">UTC days</span>
          </div>
          <svg viewBox="0 0 320 90" className="h-24 w-full" aria-hidden="true" preserveAspectRatio="none">
            {[20, 45, 70].map((y) => (
              <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="var(--color-line)" strokeWidth="1" />
            ))}
            <path d="M0 70 C40 66 60 50 100 52 S160 30 200 34 S270 18 320 14" fill="none" stroke="var(--color-ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <path d="M0 80 C50 78 80 72 120 70 S200 60 240 54 S290 50 320 44" fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
          <div className="grid grid-cols-[1.6fr_repeat(4,1fr)] gap-3 border-b border-line px-4 py-2 text-[11px] font-medium text-muted">
            {columns.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          {[0, 1, 2].map((row) => (
            <div key={row} className="grid grid-cols-[1.6fr_repeat(4,1fr)] items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <Line w={["80%", "64%", "72%"][row]} tone="bg-line-strong" />
              {[0, 1, 2, 3].map((c) => (
                <Line key={c} w="60%" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function PostsToAdsDiagram() {
  return (
    <Frame title="Create ads">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-col gap-2 rounded-[12px] border border-line bg-surface p-3">
          <span className="text-[12px] font-medium">Approved post</span>
          <span className="grid aspect-[9/16] max-h-48 place-items-center rounded-[8px] bg-selected">
            <Film className="size-5 text-muted" aria-hidden="true" />
          </span>
          <Line w="70%" />
        </div>
        <ArrowRight className="size-5 shrink-0 self-center text-muted max-sm:rotate-90" aria-hidden="true" />
        <div className="flex flex-[1.4] flex-col gap-3">
          {["Meta", "TikTok"].map((platform) => (
            <div key={platform} className="rounded-[12px] border border-line bg-surface p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium">{platform} ad</span>
                <span className="rounded-full bg-selected px-2 py-0.5 text-[11px] text-ink-2">Draft</span>
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-[11px] text-muted">
                <dt>Name</dt>
                <dd>
                  <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-ink-2">{"{campaign}_{creator}_{date}"}</span>
                </dd>
                <dt>Tracking</dt>
                <dd>
                  <Line w="70%" />
                </dd>
                <dt>Call to action</dt>
                <dd>
                  <Line w="40%" />
                </dd>
              </dl>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function AgentDiagram() {
  return (
    <Frame title="Planned: AI assistant connected over MCP">
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-[12px] rounded-br-[4px] bg-ink px-3.5 py-2.5 text-[13px] text-white">
            Which playbook in my current campaign has the most approved posts?
          </p>
        </div>
        <div className="flex items-start gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-line">
            <Bot className="size-3.5 text-ink-2" aria-hidden="true" />
          </span>
          <div className="flex w-[80%] flex-col gap-2 rounded-[12px] rounded-tl-[4px] border border-line bg-surface px-3.5 py-3">
            <Line w="90%" />
            <Line w="74%" />
            <Line w="52%" />
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <MessageSquare className="size-3.5" aria-hidden="true" />
          Reads campaigns, playbooks and posts from your workspace&apos;s reporting
        </div>
      </div>
    </Frame>
  );
}
