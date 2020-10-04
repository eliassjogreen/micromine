import {
  GetNewTaskMessage,
  Microgrid,
  Task,
  TaskStoreResultMessage,
} from "./microgrid.ts";
import { parry } from "./deps.ts";
import { check, next, prime, sieve } from "./twin_prime.ts";

export async function work(
  thread: number,
  uid: number,
  resultId: number,
  start: number,
  stop: number,
): Promise<[number, number, number, number[]]> {
  console.log(
    `[${
      thread.toString().padStart(2, "0")
    }][${uid}] Checking sequence: ${start}..${stop}`,
  );
  const startTime = performance.now();
  const result = await check(start, stop);
  const endTime = performance.now();
  console.log(
    `[${
      thread.toString().padStart(2, "0")
    }][${uid}] Finished sequence: ${start}..${stop} in ${
      ((endTime - startTime) / 1e3).toFixed(0)
    } sec with ${result.length} twins found`,
  );

  return [thread, uid, resultId, result];
}

export class Miner {
  public readonly threads;
  public readonly sieve;

  #microgrid: Microgrid;

  constructor(microgrid: Microgrid, threads = 16, sieve = 1e4) {
    this.threads = threads;
    this.sieve = sieve;
    this.#microgrid = microgrid;
  }

  public async mine() {
    console.log(`[--] Generating first ${this.sieve} primes for sieve...`);
    const primes: number[] = [];
    for (let i = 3; primes.length < this.sieve; i += 2) {
      if (prime(i)) {
        primes.push(i);
      }
    }
    
    const workers = new Array(this.threads).fill(undefined).map((_) => {
      const worker = parry(work);
      worker.use("check", check);
      worker.use("next", next);
      worker.use("sieve", sieve);
      worker.use("prime", prime);
      worker.declare("primes", primes);
      return worker;
    });
    const promises: Array<Promise<[number, number, number, number[]]>> = [];
    console.log(`[--] Starting mining using ${this.threads} workers`);

    for (let thread = 0; thread < this.threads; thread++) {
      console.log(`[--] Fetching new task for thread ${thread}...`);
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

    while (true) {
      const [thread, ...old] = await Promise.race(promises);
      console.log(`[--] Storing task ${old[1]} for thread ${thread}...`);
      await this.storeTask(old[0], old[1], old[2]);

      console.log(`[--] Fetching new task for thread ${thread}...`);
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
  }

  private async fetchTask(): Promise<Task> {
    const taskResponse = await this.#microgrid.getNewTask({ project: 1 });
    if (taskResponse.message !== GetNewTaskMessage.GetNewTaskSuccessful) {
      console.log(`[--] Could not fetch new task, exiting...`);
      Deno.exit(1);
    }

    return taskResponse.task!;
  }

  private async storeTask(
    workunit_result_uid: number,
    uid: number,
    result: number[],
  ) {
    const storeResult = await this.#microgrid.taskStoreResult({
      version: 2,
      workunit_result_uid,
      result,
    });

    if (storeResult !== TaskStoreResultMessage.TaskStoreResultSuccessful) {
      console.log(
        `[--][${uid}] Could not store result (${
          TaskStoreResultMessage[storeResult]
        }), exiting...`,
      );
      Deno.exit(1);
    }
  }
}
