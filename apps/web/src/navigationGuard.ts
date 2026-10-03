// Register before BrowserRouter mounts so an unsaved editor can restore a
// canceled history entry before the router unmounts it. When no editor has
// registered a guard this listener leaves navigation entirely unchanged.
let guard: ((event: PopStateEvent) => void) | undefined;
window.addEventListener("popstate", (event) => guard?.(event));

export function registerNavigationGuard(
  handler: (event: PopStateEvent) => void,
) {
  guard = handler;
  return () => {
    if (guard === handler) guard = undefined;
  };
}
