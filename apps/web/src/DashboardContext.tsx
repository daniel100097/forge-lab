import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { nativePage } from "./api";
import { SelectControl } from "./SelectControl";

export function DashboardContext({
  section,
}: {
  section: "activity" | "issues" | "merge-requests" | "milestones";
}) {
  const { t } = useTranslation("workspace");
  const { org = "" } = useParams();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["dashboard-context"],
    queryFn: ({ signal }) =>
      nativePage<{ organizations: { id: number; name: string }[] }>(
        "/",
        signal,
      ),
  });
  return (
    <SelectControl
      className="max-w-full max-md:w-full max-md:basis-full"
      label={t("context.label")}
      value={org}
      options={[
        { value: "", label: t("context.personal") },
        ...(query.data?.organizations || []).map((organization) => ({
          value: organization.name,
          label: organization.name,
        })),
      ]}
      onValueChange={(value) =>
        navigate(
          value
            ? `/organizations/${encodeURIComponent(value)}/${section}`
            : section === "activity"
              ? "/activity"
              : `/work/${section}`,
        )
      }
    />
  );
}
