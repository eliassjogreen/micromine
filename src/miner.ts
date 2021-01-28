import { log, parry } from "../deps.ts";
import { Microgrid } from "./microgrid.ts";
import { awaitKeypress } from "./util.ts";
import { work } from "./work.ts";

export async function mine(
  microgrid: Microgrid,
  concurrency = Deno.systemCpuInfo().cores ?? 8,
) {
  const workers = new Array(concurrency).fill(undefined).map((_, index) =>{
    const worker = parry(work, true);
    worker.declare("index", index);
    worker.declare("exit", false);
    return worker;
  });

  awaitKeypress().then(() => {
    log.warning("Detected keypress, exiting...");

    for (const worker of workers) {
      worker.declare("exit", true);
    }
  });

  await Promise.all([
    ...workers.map((worker) => worker(microgrid.sessionId, microgrid.token)),
  ]);

  parry.close();
}
