import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, X } from "lucide-react";
import { get, nativeForm } from "./api";
import { Feedback } from "./UI";
import { SelectControl } from "./SelectControl";
export function ProjectTopics({
  path,
  topics,
  editable,
}: {
  path: string;
  topics?: { name: string; count: number }[];
  editable: boolean;
}) {
  const { t } = useTranslation("repository");
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<string[]>([]),
    [value, setValue] = useState("");
  const client = useQueryClient();
  const suggestions = useQuery({
    queryKey: ["topic-suggestions", value],
    queryFn: ({ signal }) =>
      get<{ topics: { topic_name: string }[] }>(
        `/explore/topics/search?q=${encodeURIComponent(value)}&limit=20`,
        signal,
      ),
    enabled: editing,
  });
  const save = useMutation({
    mutationFn: () =>
      nativeForm(`${path}/topics`, {
        topics: draft
          .concat(value.trim() ? value.trim().split(",") : [])
          .join(","),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["repo-overview", path] });
      setEditing(false);
      setValue("");
    },
  });
  return (
    <section className="project-topics my-3">
      {!!topics?.length && !editing && (
        <div className="topic-list flex flex-wrap gap-1.5">
          {topics.map((topic) => (
            <Link
              key={topic.name}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-subtle px-2 py-0.5 text-xs text-primary"
              to={`/projects?${new URLSearchParams({ tab: "explore", q: topic.name, topic: "true" })}`}
            >
              {topic.name}
            </Link>
          ))}
        </div>
      )}
      {editable && !editing && (
        <button
          className="mt-2 inline-flex items-center gap-1 text-xs"
          disabled={!topics}
          onClick={() => {
            setDraft((topics || []).map((topic) => topic.name));
            setValue("");
            setEditing(true);
            save.reset();
          }}
        >
          <Pencil size={13} />
          {t(topics?.length ? "topics.edit" : "topics.add")}
        </button>
      )}
      {editing && (
        <form
          className="workspace-form my-3 gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <label>
            {t("topics.label")}
            <input
              aria-label={t("topics.label")}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={t("topics.placeholder")}
              onKeyDown={(event) => {
                if (event.key === "Enter" && value.trim()) {
                  event.preventDefault();
                  setDraft([
                    ...new Set([
                      ...draft,
                      ...value
                        .split(",")
                        .map((v) => v.trim().toLowerCase())
                        .filter(Boolean),
                    ]),
                  ]);
                  setValue("");
                }
              }}
            />
          </label>
          <p className="text-xs text-muted">{t("topics.hint")}</p>
          {!!suggestions.data?.topics.length && (
            <SelectControl
              className="h-8 rounded-md px-2.5 dark:border-transparent dark:bg-[#48474d] dark:hover:bg-[#535258]"
              label={t("topics.suggested")}
              value=""
              options={[
                { value: "", label: t("topics.chooseExisting") },
                ...suggestions.data.topics
                  .filter((topic) => !draft.includes(topic.topic_name))
                  .map((topic) => ({
                    value: topic.topic_name,
                    label: topic.topic_name,
                  })),
              ]}
              onValueChange={(topic) => {
                if (topic) setDraft([...draft, topic]);
                setValue("");
              }}
            />
          )}
          <div className="topic-list flex flex-wrap gap-1.5">
            {draft.map((topic) => (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-subtle px-2 py-0.5 text-xs text-primary"
                key={topic}
                aria-label={t("topics.remove", { topic })}
                onClick={() => setDraft(draft.filter((item) => item !== topic))}
              >
                {topic}
                <X size={12} />
              </button>
            ))}
          </div>
          <Feedback error={save.error} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="button primary h-8 rounded-md px-2.5"
              disabled={save.isPending}
            >
              {t("topics.save")}
            </button>
            <button
              className="button h-8 rounded-md px-2.5 dark:border-transparent dark:bg-[#48474d] dark:hover:bg-[#535258]"
              type="button"
              onClick={() => setEditing(false)}
            >
              {t("shared.cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
