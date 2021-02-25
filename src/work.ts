import type { Task } from "./microgrid.ts";

declare let exit: boolean;
declare let index: number;
declare let average: number;
declare let attempts: number;
declare let cooldown: number;

export async function work(sessionId: string, token: string) {
  const { Microgrid, GetNewTaskMessage, TaskStoreResultMessage } =
    (await import("https://denopkg.com/eliassjogreen/micromine/src/microgrid.ts"));
  const { range } = (await import("https://deno.land/x/twinprime@0.1.5/mod.ts"));
  const log = (await import("https://deno.land/std@0.88.0/log/mod.ts"));

  log.info(`[${index}] Creating worker microgrid client...`);
  const microgrid = new Microgrid(sessionId, token);
  log.info(`[${index}] Created microgrid client!`);

  async function sleep(time: number) {
    return new Promise(resolve => setTimeout(resolve, time));
  }

  async function fetchTask() {
    log.info(`[${index}] Fetching new task...`);
    const response = await microgrid.getNewTask({ project: 1 });

    if (response.message !== GetNewTaskMessage.Successful) {
      log.error(
        `[${index}] Could not fetch new task (${
          GetNewTaskMessage[response.message]
        })`,
      );
    }

    return response.task;
  }

  function calculateTask(task: Task) {
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
    } else {
      log.info(
        `[${index}] Finished generating range ${task.start_number}..${task.stop_number} for task ${task.uid} in ${
          (end - start).toFixed(0)
        } ms, found ${(twins ?? []).length}x2 twins`,
      );

      return `[${twins.join(",")}]`;
    }
  }

  async function storeTask(task: Task, result: string) {
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
        })`,
      );

      return false;
    }

    return true;
  }

  log.info(`[${index}] Starting mining...`);
  while (!exit) {
    let task;

    for (let i = 0; i < attempts && task === undefined; i++) {
      task = await fetchTask();

      if (task === undefined) {
        log.warning(`[${index}] Attempt ${i} failed, waiting ${cooldown} ms before attempting again...`);
        await sleep(cooldown);
      }
    }

    if (task === undefined) {
      log.error(`[${index}] Failed getting new task after ${attempts} attempts`);
      break;
    }

    const result = calculateTask(task);

    if (result === undefined) {
      break;
    }

    let stored = false;
    for (let i = 0; i < attempts && !stored; i++) {
      stored = await storeTask(task, result);

      if (!stored) {
        log.warning(`[${index}] Attempt ${i} failed, waiting ${cooldown} ms before attempting again...`);
        await sleep(cooldown);
      }
    }

    if (!stored) {
      log.error(`[${index}] Failed storing task ${task.uid} after ${attempts} attempts`);
      break;
    }
  }

  if (exit) {
    log.info(`[${index}] Finished mining! Average time per task ${average.toFixed(0)} ms`);
  } else {
    log.error(`[${index}] Errored out while mining, stopping worker...`);
  }
}
