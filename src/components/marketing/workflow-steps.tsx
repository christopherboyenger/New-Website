import { workflowSteps } from "./content";

/** Compact five-step workflow (homepage). */
export function WorkflowSteps() {
  return (
    <ol className="mt-12 grid gap-px overflow-hidden rounded-[16px] border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
      {workflowSteps.map((step, index) => (
        <li key={step.title} className="flex flex-col gap-3 bg-black p-6">
          <span className="font-mono text-xs text-accent" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="text-lg font-semibold tracking-tight">
            <span className="sr-only">Step {index + 1}: </span>
            {step.title}
          </h3>
          <p className="text-sm leading-relaxed text-white/65">{step.summary}</p>
        </li>
      ))}
    </ol>
  );
}

/** Detailed workflow with what the brand does and what the platform does (how-it-works). */
export function WorkflowDetail() {
  return (
    <ol className="flex flex-col">
      {workflowSteps.map((step, index) => (
        <li key={step.title} className="grid gap-6 border-t border-white/10 py-12 md:grid-cols-[220px_1fr]">
          <div>
            <span className="font-mono text-sm text-accent" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              <span className="sr-only">Step {index + 1}: </span>
              {step.title}
            </h2>
          </div>
          <div>
            <p className="text-lg text-white/85">{step.summary}</p>
            <dl className="mt-6 grid gap-6 sm:grid-cols-2">
              <div className="rounded-[12px] border border-white/10 p-5">
                <dt className="text-xs font-medium tracking-wide text-white/50 uppercase">What you do</dt>
                <dd className="mt-2 text-sm leading-relaxed text-white/75">{step.you}</dd>
              </div>
              <div className="rounded-[12px] border border-white/10 p-5">
                <dt className="text-xs font-medium tracking-wide text-white/50 uppercase">What the platform does</dt>
                <dd className="mt-2 text-sm leading-relaxed text-white/75">{step.platform}</dd>
              </div>
            </dl>
          </div>
        </li>
      ))}
    </ol>
  );
}
