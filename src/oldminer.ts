import { log, parry } from "../deps.ts";

import {
  GetNewTaskMessage,
  GetNewTaskResult,
  Microgrid,
  Task,
  TaskStoreResultMessage,
} from "./microgrid.ts";
import { awaitKeypress } from "./util.ts";

interface WorkResult {
  thread: number;
  task: Task;
  result: string;
  time: number;
}

declare let range:
  | ((start: bigint, stop: bigint) => BigUint64Array | undefined)
  | undefined;

export async function work(
  thread: number,
  task: Task,
): Promise<WorkResult> {
  if (range === undefined) {
    console.log(`Initializing worker ${thread}...`);

    try {
      range = (await import("https://deno.land/x/twinprime@0.1.5/mod.ts")).range;
    } catch (e) {
      console.log(e);
      Deno.exit(1);
    }
  }

  console.log(
    `Thread ${thread} generating range: ${task.start_number}..${task.stop_number} for task ${task.uid}`,
  );
  const startTime = performance.now();
  const result = range(BigInt(task.start_number), BigInt(task.stop_number));
  const endTime = performance.now();
  console.log(
    `Thread ${thread} finished range: ${task.start_number}..${task.stop_number} in ${
      (endTime - startTime).toFixed(0)
    } ms, found ${(result ?? []).length}*2 twins`,
  );

  if (result === undefined) {
    throw new Error(
      `Failed to generate range ${task.start_number}..${task.stop_number}`,
    );
  }

  return {
    thread,
    task,
    result: `[${result.join(",")}]`,
    time: endTime - startTime,
  };
}

export class Miner {
  public readonly threads;

  #running = false;
  #microgrid: Microgrid;

  constructor(
    microgrid: Microgrid,
    threads = Deno.systemCpuInfo().cores ?? 4,
  ) {
    this.threads = threads;
    this.#microgrid = microgrid;
  }

  public async mine() {
    this.#running = true;

    const workers = new Array(this.threads).fill(undefined).map(() => {
      const worker = parry(work, true);
      worker.declare("range", undefined);
      return worker;
    });

    const promises: Array<Promise<WorkResult>> = [];
    log.info(`Starting mining using ${this.threads} workers`);

    awaitKeypress().then(() => {
      log.info("Detected keypress, finishing tasks and exiting...");
      this.#running = false;
    });

    const finishers = [];

    while (this.#running) {
      await Promise.all([
        this.finishWork(promises),
        this.getBatch().then((batch) => {
          log.info(`Calculating ${batch.length} tasks`, [batch[0].uid]);
          let thread = 0;
          for (const task of batch) {
            promises[thread] = workers[thread](
              thread,
              task,
            );

            thread++;
          }
        }),
      ]);
    }

    finishers.push(this.finishWork(promises));
    await Promise.all(finishers);

    for (const worker of workers) {
      worker.close();
    }
  }

  private async finishWork(promises: Promise<WorkResult>[]): Promise<void> {
    const results = await Promise.all(promises);
    const storers: Promise<void>[] = [];

    if (results.length > 0) {
      log.info(
        `Finished ${results.length} tasks in ~${
          (results.map(({ time }) => time)
            .reduce((a, b) => a + b) / results.length).toFixed()
        } ms`,
        [results[0].task.uid],
      );
      log.info(`Storing tasks`, [results[0].task.uid]);

      for (const { thread, task, result } of results) {
        storers.push(this.storeTask(task, result));
      }
    }

    Promise.all(storers);
  }

  private async getBatch(): Promise<Task[]> {
    const promises = [];
    const batch = [];

    for (let i = 0; i < this.threads; i++) {
      promises.push(this.#microgrid.getNewTask({ project: 1 }));
    }

    for (const response of await Promise.all(promises)) {
      if (response.message !== GetNewTaskMessage.Successful) {
        log.error(
          `Could not fetch new task, exiting... (${
            GetNewTaskMessage[response.message]
          })`,
        );
      }

      batch.push(response.task!);
    }

    return batch;
  }

  private async storeTask(
    task: Task,
    result: string,
  ) {
    const storeResult = await this.#microgrid.taskStoreResult({
      version: 2,
      workunit_result_uid: task.workunit_result_uid,
      result,
    });

    if (storeResult !== TaskStoreResultMessage.Successful) {
      log.error(
        `Could not store result for ${task.uid} (${
          TaskStoreResultMessage[storeResult]
        }), exiting...`,
      );
    }
  }
}
