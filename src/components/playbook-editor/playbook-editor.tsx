"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { scriptMath } from "@/domain/playbook-combinatorics";
import { publishIssues } from "@/domain/playbook-validation";
import type { PlaybookTemplate } from "@/domain/playbook-templates";
import type { ActionResult } from "@/server/action-result";
import { loadLatestDraft, publishPlaybook, saveDraft, type PlaybookEditorData, type SavedDraft } from "@/server/playbooks";
import { ConfirmDialog } from "./confirm-dialog";
import { CreatorPreview } from "./creator-preview";
import { EditorHeader, type PublicationState } from "./editor-header";
import { HashtagsDialog } from "./hashtags-dialog";
import { LeftRail } from "./left-rail";
import { draftHasContent, draftReducer, instantiateTemplateContent, itemDomId, itemHasContent, type Draft, type DraftAction, type SaveStatus } from "./model";
import { PublishDialog } from "./publish-dialog";
import { AgentDialog, TemplatesDialog } from "./rail-dialogs";
import { ScriptMathDialog } from "./script-math-dialog";
import { SlideshowEditor } from "./slideshow-editor";
import { UgcEditor } from "./ugc-editor";

type Phase = "idle" | "saving" | "conflict" | "error";
type DialogName = "math" | "templates" | "agent" | "hashtags" | "publish" | "leave" | null;

function toDraft(p: PlaybookEditorData["playbook"]): Draft {
  return {
    name: p.name,
    templateId: p.templateId,
    content: p.content,
    descriptions: p.descriptions,
    hashtags: p.hashtags,
  };
}

function errorDetails(result: { fieldErrors?: Record<string, string> }): string[] {
  return [...new Set(Object.values(result.fieldErrors ?? {}))];
}

/**
 * Playbook editor shell: owns the working draft, explicit saves with
 * optimistic concurrency, the unsaved-changes guard and publishing.
 * Editing never publishes; Publish is a separate confirmed owner action.
 */
export function PlaybookEditor({ data }: { data: PlaybookEditorData }) {
  const { org, campaign } = data;
  const playbookId = data.playbook.id;
  const router = useRouter();
  const { notify } = useToast();
  const backHref = `/home/${org.slug}/campaigns?tab=playbooks&campaign=${encodeURIComponent(campaign.id)}`;

  const [draft, dispatch] = useReducer(draftReducer, data.playbook, toDraft);
  const [savedDraft, setSavedDraft] = useState<Draft>(draft);
  const versionRef = useRef(data.playbook.version);
  const draftRef = useRef(draft);
  /** Synchronous guard so two quick saves never send the same version twice. */
  const inFlightRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [saveError, setSaveError] = useState<{
    message: string;
    details: string[];
  } | null>(null);
  const [publication, setPublication] = useState<PublicationState>({
    status: data.playbook.status,
    publishedRevision: data.playbook.publishedRevision,
    hasUnpublishedChanges: data.playbook.hasUnpublishedChanges,
    active: data.playbook.active,
  });
  const [dialog, setDialog] = useState<DialogName>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<PlaybookTemplate | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<{
    message: string;
    details: string[];
  } | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const leavingRef = useRef(false);

  const dirty = draft !== savedDraft;
  const saveStatus: SaveStatus = phase === "saving" ? "saving" : phase === "conflict" ? "conflict" : phase === "error" ? "error" : dirty ? "dirty" : "saved";
  const math = useMemo(() => scriptMath(draft.content, draft.descriptions), [draft.content, draft.descriptions]);
  const issues = useMemo(
    () =>
      publishIssues({
        name: draft.name,
        content: draft.content,
        descriptions: draft.descriptions,
        campaign,
      }),
    [draft, campaign],
  );
  const issueKeys = useMemo(() => new Set(showIssues ? issues.map((i) => i.key) : []), [issues, showIssues]);

  const act = useCallback((action: DraftAction) => dispatch(action), []);

  /* --------------------------------------------------------------- saving */

  const save = useCallback(
    async (snapshot: Draft = draftRef.current): Promise<ActionResult<SavedDraft> | null> => {
      if (inFlightRef.current || phase === "conflict") return null;
      inFlightRef.current = true;
      setPhase("saving");
      let result: ActionResult<SavedDraft>;
      try {
        result = await saveDraft(org.slug, playbookId, versionRef.current, snapshot);
      } catch {
        result = {
          ok: false,
          error: "Couldn't reach the server. Check your connection and save again.",
          code: "internal",
        };
      } finally {
        inFlightRef.current = false;
      }
      if (result.ok) {
        versionRef.current = result.data.version;
        // The server stores a blank name as "Untitled playbook"; mirror it if nothing changed meanwhile.
        const persisted = result.data.name === snapshot.name ? snapshot : { ...snapshot, name: result.data.name };
        if (persisted !== snapshot && draftRef.current === snapshot) dispatch({ type: "replace", draft: persisted });
        setSavedDraft(persisted);
        setPublication((p) => ({
          ...p,
          hasUnpublishedChanges: result.data.hasUnpublishedChanges,
        }));
        setSaveError(null);
        setPhase("idle");
      } else {
        setSaveError({ message: result.error, details: errorDetails(result) });
        setPhase(result.code === "conflict" ? "conflict" : "error");
      }
      return result;
    },
    [org.slug, playbookId, phase],
  );

  const saveRef = useRef(save);
  useEffect(() => {
    draftRef.current = draft;
    saveRef.current = save;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const reloadLatest = async () => {
    const result = await loadLatestDraft(org.slug, playbookId);
    if (!result.ok) {
      setSaveError({ message: result.error, details: [] });
      return;
    }
    const latest = toDraft(result.data);
    versionRef.current = result.data.version;
    dispatch({ type: "replace", draft: latest });
    setSavedDraft(latest);
    setPublication({
      status: result.data.status,
      publishedRevision: result.data.publishedRevision,
      hasUnpublishedChanges: result.data.hasUnpublishedChanges,
      active: result.data.active,
    });
    setSaveError(null);
    setPhase("idle");
    notify("Loaded the latest saved version.");
  };

  /* ----------------------------------------------------------- navigation */

  const onBack = (event: { preventDefault: () => void }) => {
    if (!dirty || leavingRef.current) return;
    event.preventDefault();
    setDialog("leave");
  };

  const jumpTo = (domId: string) => {
    const target = document.getElementById(domId);
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
    target.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  };

  /* --------------------------------------------------------- item editing */

  const isUgc = draft.content.kind === "ugc";
  const noun = isUgc ? "scene" : "slide";

  const addItem = () => {
    const next = draftReducer(draft, { type: isUgc ? "addScene" : "addSlide" });
    dispatch({ type: "replace", draft: next });
    const items = next.content.kind === "ugc" ? next.content.scenes : next.content.slides;
    const added = items[items.length - 1];
    if (added) requestAnimationFrame(() => jumpTo(itemDomId(added.id)));
  };

  const requestRemove = (id: string) => {
    if (itemHasContent(draft.content, id)) setPendingRemoval(id);
    else dispatch({ type: "removeItem", id });
  };

  const chooseTemplate = (template: PlaybookTemplate) => {
    if (draftHasContent(draft)) {
      setPendingTemplate(template);
      setDialog(null);
    } else {
      applyTemplate(template);
    }
  };

  const applyTemplate = (template: PlaybookTemplate) => {
    dispatch({
      type: "applyTemplate",
      templateId: template.id,
      content: instantiateTemplateContent(template.content),
      descriptions: [...template.descriptions],
    });
    setPendingTemplate(null);
    setDialog(null);
    notify(`Applied the ${template.name} template. Save to keep it.`);
  };

  /* ----------------------------------------------------------- publishing */

  const openPublish = () => {
    setShowIssues(true);
    setPublishError(null);
    setDialog("publish");
  };

  const publish = async (makeActive: boolean) => {
    setPublishing(true);
    setPublishError(null);
    try {
      if (dirty) {
        const saved = await save();
        if (!saved || !saved.ok) {
          setPublishError({
            message: saved ? saved.error : "Wait for the current save to finish, then try again.",
            details: saved && !saved.ok ? errorDetails(saved) : [],
          });
          return;
        }
      }
      const result = await publishPlaybook(org.slug, playbookId, versionRef.current, { makeActive });
      if (!result.ok) {
        setPublishError({
          message: result.error,
          details: errorDetails(result),
        });
        if (result.code === "conflict") {
          setSaveError({ message: result.error, details: [] });
          setPhase("conflict");
        }
        return;
      }
      setPublication({
        status: "published",
        publishedRevision: result.data.revision,
        hasUnpublishedChanges: false,
        active: result.data.active,
      });
      setDialog(null);
      setShowIssues(false);
      notify(
        result.data.active
          ? `Published revision ${result.data.revision}. Creators can use it while the campaign is active.`
          : `Published revision ${result.data.revision}. It isn't available to creators yet.`,
        "success",
      );
    } finally {
      setPublishing(false);
    }
  };

  const saveHashtags = async (next: { descriptions: string[]; hashtags: string[] }) => {
    const updated = draftReducer(draftRef.current, {
      type: "setDescriptionsAndHashtags",
      ...next,
    });
    dispatch({ type: "replace", draft: updated });
    const result = await save(updated);
    if (result?.ok) notify("Hashtags and descriptions saved.");
    setDialog(null);
  };

  /* -------------------------------------------------------------- render */

  const removalLabel = (() => {
    if (!pendingRemoval) return "";
    if (draft.content.kind === "ugc") {
      const index = draft.content.scenes.findIndex((s) => s.id === pendingRemoval);
      return draft.content.scenes[index]?.name.trim() || `Scene ${index + 1}`;
    }
    return `Slide ${draft.content.slides.findIndex((s) => s.id === pendingRemoval) + 1}`;
  })();

  return (
    <div className="flex min-h-dvh flex-col">
      <EditorHeader
        backHref={backHref}
        onBack={onBack}
        name={draft.name}
        onRename={(name) => dispatch({ type: "rename", name })}
        publication={{
          ...publication,
          hasUnpublishedChanges: publication.hasUnpublishedChanges || (publication.status === "published" && dirty),
        }}
        saveStatus={saveStatus}
        onSave={() => void save()}
        onOpenHashtags={() => setDialog("hashtags")}
        canPublish={data.canPublish}
        onPublish={openPublish}
        notice={
          saveError ? (
            <InlineAlert
              tone="danger"
              title={phase === "conflict" ? "This playbook changed somewhere else" : "Your changes weren't saved"}
              action={
                phase === "conflict" ? (
                  <Button size="sm" variant="secondary" onClick={() => void reloadLatest()} className="max-md:min-h-11">
                    Reload latest
                  </Button>
                ) : null
              }
            >
              <p>{saveError.message}</p>
              {phase === "conflict" ? <p className="mt-1">Reloading replaces your unsaved edits in this tab with the latest saved version.</p> : null}
              {saveError.details.length > 0 ? (
                <ul className="mt-1 list-disc pl-4">
                  {saveError.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </InlineAlert>
          ) : null
        }
      />

      <div className="mx-auto grid w-full max-w-[1440px] flex-1 gap-6 px-4 py-5 md:px-6 lg:grid-cols-[272px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)_320px]">
        <aside className="lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-88px)] lg:self-start lg:overflow-y-auto lg:pb-4">
          <LeftRail
            content={draft.content}
            math={math}
            onShowMath={() => setDialog("math")}
            onOpenTemplates={() => setDialog("templates")}
            onOpenAgent={() => setDialog("agent")}
            onJumpTo={jumpTo}
            onRemove={requestRemove}
            onMove={(id, offset) => dispatch({ type: "moveItem", id, offset })}
            onAdd={addItem}
            issueKeys={issueKeys}
          />
        </aside>

        <main className="flex min-w-0 flex-col gap-4" aria-label="Playbook content">
          {!data.canPublish ? (
            <InlineAlert tone="info" className="lg:hidden">
              You can edit and save this draft. Only workspace owners can publish it.
            </InlineAlert>
          ) : null}

          {draft.content.kind === "ugc" ? (
            <UgcEditor content={draft.content} dispatch={act} mediaStorage={data.mediaStorage} onRemoveScene={requestRemove} issueKeys={issueKeys} />
          ) : (
            <SlideshowEditor content={draft.content} dispatch={act} mediaStorage={data.mediaStorage} onRemoveSlide={requestRemove} issueKeys={issueKeys} />
          )}
        </main>

        <aside className="lg:col-start-2 xl:sticky xl:top-[72px] xl:col-start-3 xl:row-start-1 xl:self-start" aria-label="Creator preview">
          <CreatorPreview
            brandName={org.name}
            content={draft.content}
            descriptions={draft.descriptions}
            hashtags={draft.hashtags}
            primaryHashtag={campaign.primaryHashtag}
            total={math.total}
          />
        </aside>
      </div>

      <ScriptMathDialog open={dialog === "math"} onClose={() => setDialog(null)} math={math} format={draft.content.kind} />
      <TemplatesDialog
        open={dialog === "templates"}
        onClose={() => setDialog(null)}
        format={draft.content.kind}
        currentTemplateId={draft.templateId}
        onChoose={chooseTemplate}
      />
      <AgentDialog
        open={dialog === "agent"}
        onClose={() => setDialog(null)}
        detail={data.aiAuthoring.detail}
        onBrowseTemplates={() => setDialog("templates")}
      />
      <HashtagsDialog
        open={dialog === "hashtags"}
        onClose={() => setDialog(null)}
        format={draft.content.kind}
        primaryHashtag={campaign.primaryHashtag}
        descriptions={draft.descriptions}
        hashtags={draft.hashtags}
        saving={phase === "saving"}
        onSave={(next) => void saveHashtags(next)}
      />
      {data.canPublish && data.payment ? (
        <PublishDialog
          open={dialog === "publish"}
          onClose={() => setDialog(null)}
          issues={issues}
          payment={data.payment}
          campaign={campaign}
          dirty={dirty}
          publishedRevision={publication.publishedRevision}
          currentlyActive={publication.active}
          busy={publishing}
          serverError={publishError}
          onPublish={(makeActive) => void publish(makeActive)}
        />
      ) : null}

      <ConfirmDialog
        open={dialog === "leave"}
        title="Leave without saving?"
        confirmLabel="Leave without saving"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          leavingRef.current = true;
          setDialog(null);
          router.push(backHref);
        }}
      >
        You have unsaved changes to this playbook. If you leave now, they&apos;ll be lost.
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`Delete this ${noun}?`}
        confirmLabel={`Delete ${noun}`}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval) dispatch({ type: "removeItem", id: pendingRemoval });
          setPendingRemoval(null);
        }}
      >
        “{removalLabel}” and everything in it will be removed from the draft. This takes effect when you save.
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingTemplate !== null}
        title="Replace the current content?"
        confirmLabel="Use template"
        confirmVariant="primary"
        onCancel={() => setPendingTemplate(null)}
        onConfirm={() => pendingTemplate && applyTemplate(pendingTemplate)}
      >
        Using “{pendingTemplate?.name}” replaces your current {isUgc ? "references, general instructions and scenes" : "general instructions and slides"} and
        your descriptions. Hashtags stay. Nothing is saved until you save.
      </ConfirmDialog>
    </div>
  );
}
