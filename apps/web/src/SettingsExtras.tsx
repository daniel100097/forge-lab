import { useEffect, useState, type ReactNode } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { useQuery } from "@tanstack/react-query";
import { request } from "./api";

/** Binary sizes like Forgejo's TrSize (B, KiB, MiB, GiB). */
export function formatBytes(value: number, language: string) {
  const decimal = (amount: number) =>
    new Intl.NumberFormat(language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    }).format(amount);
  return value >= 1024 * 1024 * 1024
    ? `${decimal(value / 1024 / 1024 / 1024)} GiB`
    : value >= 1024 * 1024
      ? `${decimal(value / 1024 / 1024)} MiB`
      : value >= 1024
        ? `${decimal(value / 1024)} KiB`
        : `${value} B`;
}

// Converts a glob into a regular expression with minimatch's defaults, which
// the native protected-branch page uses to mark matching status checks:
// "*" and "?" stay within a path segment, "**" crosses "/", and "[…]" and
// "{a,b}" are supported.
function globSource(pattern: string): string {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\" && i + 1 < pattern.length) {
      source += pattern[++i].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    } else if (char === "*") {
      if (pattern[i + 1] === "*") {
        while (pattern[i + 1] === "*") i++;
        source += ".*";
      } else source += "[^/]*";
    } else if (char === "?") source += "[^/]";
    else if (char === "[") {
      const end = pattern.indexOf("]", i + 2);
      if (end < 0) source += "\\[";
      else {
        let body = pattern.slice(i + 1, end).replace(/\\/g, "\\\\");
        if (body[0] === "!") body = `^${body.slice(1)}`;
        source += `[${body}]`;
        i = end;
      }
    } else if (char === "{") {
      const end = pattern.indexOf("}", i + 1);
      const options = end < 0 ? [] : pattern.slice(i + 1, end).split(",");
      if (options.length < 2) source += "\\{";
      else {
        source += `(?:${options.map(globSource).join("|")})`;
        i = end;
      }
    } else source += char.replace(/[.+^${}()|[\]\\/]/g, "\\$&");
  }
  return source;
}
export function globMatch(pattern: string, value: string) {
  try {
    return new RegExp(`^${globSource(pattern)}$`).test(value);
  } catch {
    return false;
  }
}

export interface Suggestion {
  value: string;
  label: string;
  detail?: string;
  avatar?: string;
}
function useDebounced(value: string, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
/**
 * Text input with server suggestions (the native search boxes start after two
 * characters). The typed text is submitted as-is under `name`.
 */
export function SuggestionInput({
  name,
  label,
  placeholder,
  required,
  className,
  queryKey,
  search,
  icon,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  queryKey: string;
  search: (query: string, signal: AbortSignal) => Promise<Suggestion[]>;
  icon?: ReactNode;
}) {
  const [value, setValue] = useState("");
  const query = useDebounced(value.trim());
  const results = useQuery({
    queryKey: ["settings-suggestions", queryKey, query],
    queryFn: ({ signal }) => search(query, signal),
    enabled: query.length >= 2,
    staleTime: 30_000,
    retry: false,
  });
  const items = query.length >= 2 && !results.error ? (results.data ?? []) : [];
  return (
    <Autocomplete.Root
      name={name}
      required={required}
      items={items}
      value={value}
      onValueChange={setValue}
      filter={null}
      itemToStringValue={(item: Suggestion) => item.value}
    >
      <Autocomplete.Input
        className={className}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      <Autocomplete.Portal hidden={!items.length}>
        <Autocomplete.Positioner
          className="dropdown-positioner"
          sideOffset={4}
          align="start"
        >
          <Autocomplete.Popup className="dropdown-popup">
            <Autocomplete.List className="dropdown-list max-h-[min(320px,calc(var(--available-height)-8px))]">
              {(item: Suggestion) => (
                <Autocomplete.Item
                  key={item.value}
                  value={item}
                  className="dropdown-option"
                >
                  {item.avatar ? (
                    <img
                      className="size-6 shrink-0 rounded-full border border-line"
                      src={item.avatar}
                      alt=""
                    />
                  ) : (
                    icon
                  )}
                  <span className="option-copy">
                    {item.label}
                    {item.detail && <small>{item.detail}</small>}
                  </span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

/** The native collaborator search: active individual users. */
export async function searchUsers(query: string, signal: AbortSignal) {
  const { data } = await request<{
    data: { login: string; full_name: string; avatar_url: string }[];
  }>(`/user/search_candidates?q=${encodeURIComponent(query)}`, { signal });
  const exact = query.toLowerCase();
  return (data.data ?? [])
    .map((user) => ({
      value: user.login,
      label: user.login,
      detail: user.full_name || undefined,
      avatar: user.avatar_url,
    }))
    .sort(
      (a, b) =>
        Number(b.value.toLowerCase() === exact) -
        Number(a.value.toLowerCase() === exact),
    );
}

/** The native team search of an organization (organization administrators only). */
export function teamSearch(org: string) {
  return async (query: string, signal: AbortSignal) => {
    const { data } = await request<{
      data: { name: string; description: string }[];
    }>(
      `/org/${encodeURIComponent(org)}/teams/-/search?q=${encodeURIComponent(query)}`,
      { signal },
    );
    return (data.data ?? []).map((team) => ({
      value: team.name,
      label: team.name,
      detail: team.description || undefined,
    }));
  };
}
