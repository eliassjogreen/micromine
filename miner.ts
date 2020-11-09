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
      undefined,
      thread,
    );
    try {
      generate =
        (await import("https://deno.land/x/twinprime@0.1.2/mod.ts"))
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
  public readonly overhead;

  #running = false;
  #microgrid: Microgrid;

  constructor(
    microgrid: Microgrid,
    threads = Deno.systemCpuInfo().cores ?? 4,
    overhead = threads,
  ) {
    this.threads = threads;
    this.overhead = overhead;
    this.#microgrid = microgrid;
  }

  public async mine() {
    const workers = new Array(this.threads).fill(undefined).map((_) => {
      const worker = parry(work, true);
      worker.declare("generate", undefined);
      worker.use("log", log);
      return worker;
    });

    const tasks = this.tasks();
    const promises: Array<Promise<WorkResult>> = [];
    log(`Starting mining using ${this.threads} workers`);

    for (let thread = 0; thread < this.threads; thread++) {
      log(`Fetching new task for thread ${thread}...`);
      const next = await tasks.next();
      if (!next.done) {
        const task = next.value;

        promises[thread] = workers[thread](
          thread,
          task,
        );
      }
    }

    readKeypress().next().then((_) => {
      log("Detected keypress, finishing tasks and exiting...");
      this.#running = false;
    });

    while (true) {
      const { thread, task, result } = await Promise.race(promises);
      log(`Storing task ${task.uid} for thread ${thread}...`);
      await this.storeTask(task, result);
      
      const next = await tasks.next();
      if (!next.done) {
        promises[thread] = workers[thread](
          thread,
          next.value,
        );
      } else {
        break;
      }
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

  private async *tasks() {
    const queue: Array<Task> = [];
    const promises: Array<Promise<GetNewTaskResult>> = [];

    log(
      `Initializing by loading ${this.threads + this.overhead} tasks to queue`,
    );

    for (let i = 0; i < this.threads + this.overhead; i++) {
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

      queue.push(response.task!);
    }

    while (queue.length > 0) {
      yield queue.pop()!;

      if (this.#running) {
        const response = await this.#microgrid.getNewTask({ project: 1 });

        if (response.message !== GetNewTaskMessage.Successful) {
          error(
            `Could not fetch new task, exiting... (${
              GetNewTaskMessage[response.message]
            })`,
          );
        }
  
        queue.push(response.task!);
      }
    }
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
