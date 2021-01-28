import type { LevelName } from "../deps.ts";

declare let exit: boolean;
declare let index: number;

export async function work(sessionId: string, token: string) {
  const { Microgrid, GetNewTaskMessage, TaskStoreResultMessage } =
    (await import("https://denopkg.com/eliassjogreen/micromine/src/microgrid.ts"));
  const { range } = (await import("https://deno.land/x/twinprime@0.1.5/mod.ts"));
  const log = (await import("https://deno.land/std@0.84.0/log/mod.ts"));

  log.info(`[${index}] Creating worker microgrid client...`);
  const microgrid = new Microgrid(sessionId, token);

  let average = 0;

  log.info(`[${index}] Starting mining...`);
  while (!exit) {
    log.info(`[${index}] Getting new task...`);
    const response = await microgrid.getNewTask({ project: 1 });

    if (response.message !== GetNewTaskMessage.Successful) {
      log.error(
        `[${index}] Could not fetch new task, exiting... (${
          GetNewTaskMessage[response.message]
        })`,
      );
      Deno.exit(1);
    }

    const task = response.task!;

    log.info(
      `[${index}] Generating range: ${task.start_number}..${task.stop_number} for task ${task.uid}`,
    );
    const start = performance.now();
    const twins = range(BigInt(task.start_number), BigInt(task.stop_number));
    const end = performance.now();

    average = (average + (end - start)) / 2;

    if (twins === undefined) {
      log.error(
        `[${index}] Failed generating range ${task.start_number}..${task.stop_number} for task ${task.uid} in ${
          (end - start).toFixed(0)
        } ms`,
      );
      Deno.exit(1);
    } else {
      log.info(
        `[${index}] Finished generating range ${task.start_number}..${task.stop_number} for task ${task.uid} in ${
          (end - start).toFixed(0)
        } ms, found ${(twins ?? []).length}x2 twins`,
      );
    }

    const result = `[${twins.join(",")}]`;

    log.info(`[${index}] Storing task ${task.uid} results`);
    const storeResult = await microgrid.taskStoreResult({
      version: 2,
      workunit_result_uid: task.workunit_result_uid,
      result,
    });

    if (storeResult !== TaskStoreResultMessage.Successful) {
      log.error(
        `[${index}] Could not store result for ${task.uid} (${
          TaskStoreResultMessage[storeResult]
        }), exiting...`,
      );
    }
  }

  log.info(`[${index}] Finished mining! Average time per task ${average.toFixed(0)} ms`);
}
