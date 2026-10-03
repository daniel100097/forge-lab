export interface MilestoneFilterLabel {
  id: number;
  name: string;
  color: string;
  exclusive?: boolean;
  archived?: boolean;
}

export function milestoneLabelIDs(value: string) {
  return [...new Set(value.split(",").map(Number))].filter(
    (labelID) => Number.isSafeInteger(labelID) && labelID !== 0,
  );
}

function exclusiveScope(label?: MilestoneFilterLabel) {
  if (!label?.exclusive) return "";
  const separator = label.name.lastIndexOf("/");
  return separator > 0 && separator < label.name.length - 1
    ? label.name.slice(0, separator)
    : "";
}

export function milestoneLabelSelection(
  value: string,
  labels: MilestoneFilterLabel[],
  label: MilestoneFilterLabel,
  exclude = false,
) {
  const selected = milestoneLabelIDs(value);
  const scope = exclusiveScope(label);
  const next = selected.filter((labelID) => {
    if (Math.abs(labelID) === label.id) return false;
    return (
      exclude ||
      labelID < 0 ||
      !scope ||
      scope !== exclusiveScope(labels.find((item) => item.id === labelID))
    );
  });
  if (exclude ? !selected.includes(-label.id) : !selected.includes(label.id))
    next.push(exclude ? -label.id : label.id);
  return next.sort((first, second) => first - second).join(",");
}
