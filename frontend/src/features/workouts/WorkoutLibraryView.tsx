import { AlertTriangle, Copy, Dumbbell, Library, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Placeholder } from "../../components/shared/Placeholder";
import { StatusBanner } from "../../components/shared/StatusBanner";
import { fetchJson, toApiErrorPresentation } from "../../lib/api";
import { todayDateString } from "../../lib/dates";
import { defaultForm } from "../../lib/forms";
import { formatNumber } from "../../lib/formatters";
import { prescriptionTotals, templateToWorkoutForm, workoutTemplatePayload } from "../../lib/prescriptions";
import { queryKeys, useWorkoutTemplatesQuery } from "../../lib/queries";
import { useProfileId } from "../../lib/profileContext";
import { formatDurationSeconds } from "../../lib/workoutMetrics";
import type { WorkoutForm, WorkoutTemplate } from "../../types/domain";
import { WorkoutEditor } from "./WorkoutEditor";

export function WorkoutLibraryView({ writesBlocked }: { writesBlocked: boolean }) {
  const profileId = useProfileId();
  const queryClient = useQueryClient();
  const templatesQuery = useWorkoutTemplatesQuery(profileId);
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<WorkoutForm | null>(null);
  const [editorTags, setEditorTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const queryError = templatesQuery.isError
    ? toApiErrorPresentation(templatesQuery.error, "Could not load the workout library.").detail
    : null;

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter((template) =>
      [template.name, template.workoutType, template.purpose, ...template.tags]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, templates]);

  function openNew() {
    setError(null);
    setEditorTags([]);
    setEditor({ ...defaultForm(todayDateString()), title: "", prescription: null });
  }

  function openEdit(template: WorkoutTemplate) {
    setError(null);
    setEditorTags(template.tags);
    setEditor(templateToWorkoutForm(template, todayDateString()));
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload = workoutTemplatePayload(editor, editorTags);
      await fetchJson(editor.id ? `/api/workout-templates/${editor.id}` : "/api/workout-templates", {
        method: editor.id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workoutTemplates(profileId) });
      setEditor(null);
    } catch (caught) {
      setError(toApiErrorPresentation(caught, "Could not save the library workout.").detail);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTemplate(template: WorkoutTemplate) {
    if (!window.confirm(`Delete “${template.name}” from your workout library?`)) return;
    try {
      await fetchJson(`/api/workout-templates/${template.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workoutTemplates(profileId) });
    } catch (caught) {
      setError(toApiErrorPresentation(caught, "Could not delete the library workout.").detail);
    }
  }

  async function duplicateTemplate(template: WorkoutTemplate) {
    setError(null);
    try {
      await fetchJson("/api/workout-templates", {
        method: "POST",
        body: JSON.stringify({
          name: `${template.name} copy`,
          workoutType: template.workoutType,
          tags: template.tags,
          prescription: structuredClone(template.prescription),
          purpose: template.purpose,
          instructions: template.instructions
        })
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workoutTemplates(profileId) });
    } catch (caught) {
      setError(toApiErrorPresentation(caught, "Could not duplicate the library workout.").detail);
    }
  }

  return (
    <section className="workout-library-view">
      <header className="workout-library-header">
        <div>
          <p className="eyebrow">Workout library</p>
          <h2>Reusable workouts</h2>
          <p>Define a workout once, then schedule an independent copy while planning any week.</p>
        </div>
        <button className="primary-button" disabled={writesBlocked} type="button" onClick={openNew}>
          <Plus size={17} /> New workout
        </button>
      </header>

      {error || queryError ? <StatusBanner tone="danger" icon={<AlertTriangle size={18} />} title="Workout library error" detail={error ?? queryError ?? "Could not load the workout library."} /> : null}

      <label className="workout-library-search">
        <Search size={17} aria-hidden="true" />
        <input aria-label="Search workout library" placeholder="Search by name, type, purpose, or tag" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>

      {templatesQuery.isLoading ? <Placeholder icon={<Library size={22} />} title="Loading workout library…" /> : null}
      {!templatesQuery.isLoading && !templatesQuery.isError && !visibleTemplates.length ? (
        <Placeholder
          icon={<Library size={22} />}
          title={search ? "No workouts match that search." : "Your workout library is empty."}
          detail={search ? "Try another name, type, purpose, or tag." : "Add your first reusable workout to schedule it from any week."}
        />
      ) : null}
      <div className="workout-library-grid">
        {visibleTemplates.map((template) => (
          <WorkoutTemplateCard
            key={template.id}
            template={template}
            onDelete={() => deleteTemplate(template)}
            onDuplicate={() => duplicateTemplate(template)}
            onEdit={() => openEdit(template)}
            writesBlocked={writesBlocked}
          />
        ))}
      </div>

      {editor ? (
        <WorkoutEditor
          editor={editor}
          error={error}
          isSaving={isSaving}
          mode="template"
          setEditor={setEditor}
          templateTags={editorTags}
          setTemplateTags={setEditorTags}
          onSubmit={saveTemplate}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </section>
  );
}

function WorkoutTemplateCard({
  onDelete,
  onDuplicate,
  onEdit,
  template,
  writesBlocked
}: {
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  template: WorkoutTemplate;
  writesBlocked: boolean;
}) {
  const totals = prescriptionTotals(template.prescription);
  return (
    <article className="workout-template-card">
      <div className="workout-template-card__icon"><Dumbbell size={18} /></div>
      <div className="workout-template-card__content">
        <div className="workout-template-card__heading">
          <div><h3>{template.name}</h3><span>{template.workoutType.replaceAll("_", " ")}</span></div>
          <div className="workout-template-card__actions">
            <button aria-label={`Edit ${template.name}`} disabled={writesBlocked} type="button" onClick={onEdit}><Pencil size={15} /></button>
            <button aria-label={`Duplicate ${template.name}`} disabled={writesBlocked} type="button" onClick={onDuplicate}><Copy size={15} /></button>
            <button aria-label={`Delete ${template.name}`} disabled={writesBlocked} type="button" onClick={onDelete}><Trash2 size={15} /></button>
          </div>
        </div>
        {template.purpose ? <p>{template.purpose}</p> : null}
        <div className="workout-template-card__meta">
          {totals.distance ? <span>{formatNumber(totals.distance / 1609.344)} mi known</span> : null}
          {totals.duration ? <span>{formatDurationSeconds(totals.duration)}</span> : null}
          <span>{template.prescription.blocks.length} block{template.prescription.blocks.length === 1 ? "" : "s"}</span>
        </div>
        {template.tags.length ? <div className="workout-template-tags">{template.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
      </div>
    </article>
  );
}
