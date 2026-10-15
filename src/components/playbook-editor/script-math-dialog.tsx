"use client";

import { Dialog } from "@/components/ui/dialog";
import { formatScriptCount, type ScriptMath } from "@/domain/playbook-combinatorics";
import type { ContentFormat } from "@/domain/playbook-content";

/** "See the math": explains how the unique-script count is built (L06). */
export function ScriptMathDialog({ open, onClose, math, format }: { open: boolean; onClose: () => void; math: ScriptMath; format: ContentFormat }) {
  const itemCount = math.factors.length - 1;
  const unit = format === "ugc" ? "step" : "slide";
  return (
    <Dialog open={open} onClose={onClose} title="The math, step by step" size="md">
      <div className="flex flex-col gap-5">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[10px] bg-canvas px-4 py-3 text-sm text-ink-2">
          <span>
            1 script ({itemCount} {itemCount === 1 ? unit : `${unit}s`})
          </span>
          <span aria-hidden="true">×</span>
          <span>{format === "ugc" ? "your on-screen text options" : "your image and caption options"}</span>
          <span aria-hidden="true">×</span>
          <span>your descriptions</span>
          <span aria-hidden="true">=</span>
          <span className="text-lg font-semibold text-ink">{formatScriptCount(math.total)}</span>
          <span>unique scripts</span>
        </p>
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Every option multiplies your script.</h3>
          <p className="mt-1 text-sm text-muted">
            {format === "ugc"
              ? "Each creator gets one on-screen text option per scene and one description. A scene without on-screen text counts once."
              : "Each post gets one image option and one caption per slide, plus one description. A slide without options counts once."}{" "}
            More variations give you more combinations to compare.
          </p>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">Factors in the unique-script count</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Part</th>
              <th scope="col">Options</th>
              <th scope="col">Factor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-y border-line">
            {math.factors.map((f, i) => (
              <tr key={i}>
                <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">
                  {f.label}
                </th>
                <td className="py-2.5 pr-3 text-muted">{f.detail}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-ink">×{f.factor.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2} className="pt-3 text-left font-semibold text-ink">
                Total
              </th>
              <td className="pt-3 text-right font-mono text-base font-semibold tabular-nums text-ink">{formatScriptCount(math.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Dialog>
  );
}
