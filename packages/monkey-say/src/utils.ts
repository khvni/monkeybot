import { execSync } from "node:child_process";
import { platform } from "node:os";

export function commandExists(cmd: string): boolean {
  try {
    const checkCmd = platform() === "win32" ? "where" : "which";
    execSync(`${checkCmd} ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
