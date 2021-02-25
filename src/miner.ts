import { log, parry } from "../deps.ts";
import { Microgrid } from "./microgrid.ts";
import { awaitKeypress } from "./util.ts";
import { work } from "./work.ts";

export async function mine(
  microgrid: Microgrid,
  concurrency = Deno.systemCpuInfo().cores ?? 8,
  attempts = 5,
  cooldown = 10000
) {
  const workers = new Array(concurrency).fill(undefined).map((_, index) =>{
    log.info(`Configuring worker ${index}`);
    
    const worker = parry(work, true);
    worker.declare("index", index);
    worker.declare("exit", false);
    worker.declare("average", 0);
    worker.declare("attempts", attempts);
    worker.declare("cooldown", cooldown);
    return worker;
  });

  awaitKeypress().then(() => {
    log.warning("Detected keypress, exiting...");

    for (const worker of workers) {
      try {
        worker.declare("exit", true);
      } catch (err) {
        log.error(`Cought error ${err} when exiting worker`);
      }
    }
  });

  await Promise.all([
    ...workers.map((worker) => worker(microgrid.sessionId, microgrid.token)),
  ]).catch((err) => {
    log.error(`Worker threw error ${err}`);
  });

  parry.close();
}
