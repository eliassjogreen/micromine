import { log, parry } from "../deps.ts";
import { Microgrid } from "./microgrid.ts";
import { awaitKeypress } from "./util.ts";
import { work } from "./work.ts";

export async function mine(
  microgrid: Microgrid,
  concurrency = Deno.systemCpuInfo().cores ?? 8,
) {
  const workers = new Array(concurrency).fill(undefined).map(() =>
    parry(work, true)
  );
  await Promise.race([
    awaitKeypress().then(() => log.warning("Detected keypress, exiting...")),
    ...workers.map((worker) => worker(microgrid.sessionId, microgrid.token)),
  ]);
}
