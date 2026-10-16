import type { UpdaterStatus } from "../types/api";
import { apiJson } from "./client";

/** 当前版本、远端版本与是否有可用更新（左上角提示读这个）。 */
export function getUpdaterStatus(): Promise<UpdaterStatus> {
  return apiJson<UpdaterStatus>("/api/updater/status");
}

/** 只检测：刷新远端并回报是否有可用更新，不部署。 */
export function checkUpdater(): Promise<unknown> {
  return apiJson("/api/updater/check", { method: "POST" });
}

/** 点击部署：有新版本则拉取并重建。 */
export function deployUpdater(): Promise<unknown> {
  return apiJson("/api/updater/deploy", { method: "POST" });
}
