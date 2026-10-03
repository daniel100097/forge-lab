import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`${command} failed (${signal ?? code})`)),
    );
  });
}
export const local = (...parts) => resolve(root, ...parts);
