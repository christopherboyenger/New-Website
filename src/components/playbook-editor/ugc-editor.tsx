"use client";

import { ExternalLink, Film, Trash2 } from "lucide-react";
import { NotConfiguredNotice } from "@/components/ui/feedback";
import { Input, Textarea } from "@/components/ui/form";
import type { UgcContent } from "@/domain/playbook-content";
import { playbookLimits } from "@/domain/playbook-validation";
import { GeneralInstructions } from "./general-instructions";
import { LinkAdder } from "./link-adder";
import { hostOf, itemDomId, type DraftAction } from "./model";
import { OptionList } from "./option-list";

export function UgcEditor({
  content,
  dispatch,
  mediaStorage,
  onRemoveScene,
  issueKeys,
}: {
  content: UgcContent;
  dispatch: (action: DraftAction) => void;
  mediaStorage: { configured: boolean; detail: string };
  onRemoveScene: (id: string) => void;
  /** Publish-validation keys to highlight ("scene:<id>"). */
  issueKeys: ReadonlySet<string>;
}) {
  const atReferenceLimit = content.references.length >= playbookLimits.references;
  return (
    <div className="flex flex-col gap-6">
      <section id="references" aria-labelledby="references-title" className="scroll-mt-28 rounded-[12px] border border-line bg-surface p-4 sm:p-5">
        <h2 id="references-title" className="text-base font-semibold text-ink">
          References
        </h2>
        <p className="mt-1 text-sm text-muted">
          Example videos creators study before filming. Add more than one so creators copy the idea, not a single video.
        </p>

        {content.references.length > 0 ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {content.references.map((ref, index) => (
              <li key={ref.id} className="flex items-center gap-3 rounded-[10px] border border-line bg-canvas px-3 py-2">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-selected text-ink-2" aria-hidden="true">
                  <Film className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{ref.title || `Reference ${index + 1}`}</p>
                  {ref.url ? (
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex max-w-full items-center gap-1 truncate text-[13px] text-muted underline-offset-2 hover:underline"
                    >
                      <span className="truncate">{hostOf(ref.url)}</span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "removeReference", id: ref.id })}
                  aria-label={`Remove reference ${index + 1}`}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-ink max-md:size-11"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-[10px] border border-dashed border-line-strong px-3 py-4 text-center text-sm text-muted">No reference videos yet.</p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {!mediaStorage.configured ? (
            <NotConfiguredNotice title="Video uploads aren't available on this deployment">
              {mediaStorage.detail} Paste a link to a public example instead.
            </NotConfiguredNotice>
          ) : null}
          <LinkAdder
            urlLabel="Reference video link"
            addLabel="Add link"
            disabled={atReferenceLimit}
            disabledReason={`You can add up to ${playbookLimits.references} references.`}
            onAdd={(link) =>
              dispatch({
                type: "addReference",
                reference: { assetId: null, url: link.url, title: link.title },
              })
            }
          />
        </div>
      </section>

      <GeneralInstructions value={content.generalInstructions} onChange={(value) => dispatch({ type: "general", value })} />

      {content.scenes.length === 0 ? (
        <section className="rounded-[12px] border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
          <h2 className="text-[15px] font-semibold text-ink">No scenes yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Break the video into scenes creators film in order. Add one with New scene, or start from a template.
          </p>
        </section>
      ) : null}

      {content.scenes.map((scene, index) => {
        const nameId = `scene-name-${scene.id}`;
        const instructionsId = `scene-instructions-${scene.id}`;
        const flagged = issueKeys.has(`scene:${scene.id}`);
        return (
          <section
            key={scene.id}
            id={itemDomId(scene.id)}
            aria-label={`Scene ${index + 1} of ${content.scenes.length}`}
            className={`scroll-mt-28 rounded-[12px] border bg-surface p-4 sm:p-5 ${flagged ? "border-warning-line" : "border-line"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-muted">
                Scene {index + 1} of {content.scenes.length} · Instructions for creators
              </p>
              <button
                type="button"
                onClick={() => onRemoveScene(scene.id)}
                className="inline-flex min-h-8 items-center gap-1 rounded-[8px] px-2 text-[13px] text-muted hover:bg-hover hover:text-danger max-md:min-h-11"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Remove scene
              </button>
            </div>
            <label htmlFor={nameId} className="sr-only">
              Scene {index + 1} name
            </label>
            <Input
              id={nameId}
              value={scene.name}
              placeholder="Enter scene title"
              maxLength={playbookLimits.sceneName}
              onChange={(e) =>
                dispatch({
                  type: "updateScene",
                  id: scene.id,
                  patch: { name: e.target.value },
                })
              }
              className="mt-3 h-10 border-transparent px-0 text-[17px] font-semibold shadow-none hover:border-transparent focus:border-line focus:px-3 max-md:h-11"
            />
            <label htmlFor={instructionsId} className="sr-only">
              Scene {index + 1} instructions
            </label>
            <Textarea
              id={instructionsId}
              value={scene.instructions}
              placeholder="Type instructions for this scene..."
              maxLength={playbookLimits.instructions}
              onChange={(e) =>
                dispatch({
                  type: "updateScene",
                  id: scene.id,
                  patch: { instructions: e.target.value },
                })
              }
              className="mt-2"
            />
            <div className="mt-4 border-t border-line pt-4">
              <OptionList
                heading={`${scene.textOptions.length} On-screen text`}
                hint="one is picked per creator"
                itemLabel={`Scene ${index + 1} on-screen text`}
                addLabel="Add text"
                addAccessibleLabel={`Add text to scene ${index + 1}`}
                placeholder="Text on screen…"
                emptyText="No on-screen text for this scene. Creators just follow the instructions."
                maxLength={playbookLimits.textOption}
                values={scene.textOptions}
                onChange={(textOptions) => dispatch({ type: "setSceneText", id: scene.id, textOptions })}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
