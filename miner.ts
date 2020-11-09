import { parry, readKeypress } from "./deps.ts";

import {
  GetNewTaskMessage,
  GetNewTaskResult,
  Microgrid,
  Task,
  TaskStoreResultMessage,
} from "./microgrid.ts";
import { error, log } from "./log.ts";

interface WorkResult {
  thread: number;
  task: Task;
  result: string;
}

declare let generate: ((start: bigint, stop: bigint) => string) | undefined;

export async function work(
  thread: number,
  task: Task,
): Promise<WorkResult> {
  if (generate === undefined) {
    log(
      `Importing twinprime plugin...`,
      [task.uid],
      thread,
    );
    try {
      generate = (await import("https://deno.land/x/twinprime@0.1.2/mod.ts"))
        .generateRaw;
    } catch (e) {
      console.log(e);
    }
  }

  log(
    `Generating sequence: ${task.start_number}..${task.stop_number}`,
    [task.uid],
    thread,
  );
  const startTime = performance.now();
  const result = generate!(BigInt(task.start_number), BigInt(task.stop_number));
  const endTime = performance.now();
  log(
    `Finished sequence: ${task.start_number}..${task.stop_number} in ${
      ((endTime - startTime) / 1e3).toFixed(0)
    } sec`,
    [task.uid],
    thread,
  );

  return {
    thread,
    task,
    result,
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

    const workers = new Array(this.threads).fill(undefined).map((_) => {
      const worker = parry(work, true);
      worker.declare("generate", undefined);
      worker.use("log", log);
      return worker;
    });

    const promises: Array<Promise<WorkResult>> = [];
    log(`Starting mining using ${this.threads} workers`);

    readKeypress().next().then((_) => {
      log("Detected keypress, finishing tasks and exiting...");
      this.#running = false;
    });

    while (this.#running) {
      const results = await Promise.all(promises);
      const storePromises = [];
      for (const { thread, task, result } of results) {
        log(`Storing task for thread ${thread}...`, [task.uid]);
        storePromises.push(this.storeTask(task, result));
      }

      const batch = await this.getBatch();
      let thread = 0;
      for (const task of batch) {
        promises[thread] = workers[thread](
          thread,
          task,
        );

        thread++;
      }

      await Promise.all(storePromises);
    }

    const results = await Promise.all(promises);
    for (const { thread, task, result } of results) {
      log(`Storing task ${task.uid} for thread ${thread}...`);
      await this.storeTask(task, result);
    }

    for (const worker of workers) {
      worker.close();
    }
  }

  private async getBatch(size: number = this.threads): Promise<Task[]> {
    log(`Getting batch of ${size} tasks`);

    const promises = [];
    const batch = [];

    for (let i = 0; i < this.threads; i++) {
      promises.push(this.#microgrid.getNewTask({ project: 1 }));
    }

    for (const response of await Promise.all(promises)) {
      if (response.message !== GetNewTaskMessage.Successful) {
        error(
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
      error(
        `Could not store result (${
          TaskStoreResultMessage[storeResult]
        }), exiting...`,
        [task.uid],
      );
    }
  }
}
