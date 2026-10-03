import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "./api";

export function WorkspaceUserInput({ placeholder }: { placeholder: string }) {
  const list = useId();
  const [value, setValue] = useState("");
  const query = useQuery({
    queryKey: ["workspace-user-search", value],
    enabled: value.trim().length >= 2,
    queryFn: ({ signal }) =>
      get<{ data: { login: string; full_name: string }[] }>(
        `/users/search?${new URLSearchParams({ q: value, limit: "10" })}`,
        signal,
      ),
  });
  return (
    <>
      <input
        className="min-w-0 rounded border border-input bg-surface px-3 py-2 text-sm"
        name="uname"
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        list={list}
        autoComplete="off"
      />
      <datalist id={list}>
        {query.data?.data.map((user) => (
          <option key={user.login} value={user.login}>
            {user.full_name || user.login}
          </option>
        ))}
      </datalist>
    </>
  );
}
