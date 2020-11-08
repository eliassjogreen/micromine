import { parry, readKeypress } from "./deps.ts";

import {
  GetNewTaskMessage,
  Microgrid,
  Task,
  TaskStoreResultMessage,
} from "./microgrid.ts";
import { error, log } from "./log.ts";

declare let generate: ((start: bigint, stop: bigint) => bigint[]) | undefined;

export async function work(
  thread: number,
  uid: number,
  resultId: number,
  start: number,
  stop: number,
): Promise<[number, number, number, bigint[]]> {
  if (generate === undefined) {
    log(
      `Importing twinprime plugin...`,
      undefined,
      thread,
    );
    try {
      generate =
        (await import("https://deno.land/x/twinprime@0.1.1/mod.ts")).generate;
    } catch (e) {
      console.log(e);
    }
  }

  log(
    `Generating sequence: ${start}..${stop}`,
    [uid],
    thread,
  );
  const startTime = performance.now();
  const result = generate!(BigInt(start), BigInt(stop));
  const endTime = performance.now();
  log(
    `Finished sequence: ${start}..${stop} in ${
      ((endTime - startTime) / 1e3).toFixed(0)
    } sec with ${result.length} twins found`,
    [uid],
    thread,
  );

  return [thread, uid, resultId, result];
}

export class Miner {
  public readonly threads;

  #microgrid: Microgrid;

  constructor(
    microgrid: Microgrid,
    threads = Deno.systemCpuInfo().cores ?? 4,
  ) {
    this.threads = threads;
    this.#microgrid = microgrid;
  }

  public async mine() {
    const workers = new Array(this.threads).fill(undefined).map((_) => {
      const worker = parry(work, true);
      worker.declare("generate", undefined);
      worker.use("log", log);
      return worker;
    });

    const promises: Array<Promise<[number, number, number, bigint[]]>> = [];
    log(`Starting mining using ${this.threads} workers`);

    for (let thread = 0; thread < this.threads; thread++) {
      log(`Fetching new task for thread ${thread}...`);
      const { uid, start_number, stop_number, workunit_result_uid } = await this
        .fetchTask();

      promises[thread] = workers[thread](
        thread,
        uid,
        workunit_result_uid,
        start_number,
        stop_number,
      );
    }

    let running = true;

    readKeypress().next().then((_) => {
      log("Detected keypress, finishing tasks and exiting...");
      running = false;
    });

    while (running) {
      const [thread, ...old] = await Promise.race(promises);
      log(`Storing task ${old[1]} for thread ${thread}...`);
      await this.storeTask(old[0], old[1], old[2]);

      log(`Fetching new task for thread ${thread}...`);
      const { uid, start_number, stop_number, workunit_result_uid } = await this
        .fetchTask();
      promises[thread] = workers[thread](
        thread,
        uid,
        workunit_result_uid,
        start_number,
        stop_number,
      );
    }

    const results = await Promise.all(promises);
    for (const [thread, ...old] of results) {
      log(`Storing task ${old[1]} for thread ${thread}...`);
      await this.storeTask(old[0], old[1], old[2]);
    }

    for (const worker of workers) {
      worker.close();
    }
  }

  private async fetchTask(): Promise<Task> {
    const taskResponse = await this.#microgrid.getNewTask({ project: 1 });
    if (taskResponse.message !== GetNewTaskMessage.Successful) {
      error(`Could not fetch new task, exiting... (${GetNewTaskMessage[taskResponse.message]})`);
    }

    return taskResponse.task!;
  }

  private async storeTask(
    workunit_result_uid: number,
    uid: number,
    result: bigint[],
  ) {
    const storeResult = await this.#microgrid.taskStoreResult({
      version: 2,
      workunit_result_uid,
      result,
    });

    if (storeResult !== TaskStoreResultMessage.Successful) {
      error(
        `Could not store result (${
          TaskStoreResultMessage[storeResult]
        }), exiting...`,
        [uid],
      );
    }
  }
}
