export async function work(sessionId: string, token: string) {
  const { Microgrid, GetNewTaskMessage, TaskStoreResultMessage } =
    (await import("file://./microgrid.ts"));
  const { range } = (await import("https://deno.land/x/twinprime@0.1.5/mod.ts"));
  const log = (await import("https://deno.land/std@0.84.0/log/mod.ts"));

  const microgrid = new Microgrid(sessionId, token);

  while (true) {
    const response = await microgrid.getNewTask({ project: 1 });

    if (response.message !== GetNewTaskMessage.Successful) {
      log.error(
        `Could not fetch new task, exiting... (${
          GetNewTaskMessage[response.message]
        })`,
      );
      Deno.exit(1);
    }

    const task = response.task!;

    console.log(
      `Generating range: ${task.start_number}..${task.stop_number} for task ${task.uid}`,
    );
    const start = performance.now();
    const twins = range(BigInt(task.start_number), BigInt(task.stop_number));
    const end = performance.now();

    if (twins === undefined) {
      log.error(
        `Failed generating range ${task.start_number}..${task.stop_number} for task ${task.uid} in ${
          (end - start).toFixed(0)
        } ms`,
      );
      Deno.exit(1);
    } else {
      log.info(
        `Finished generating range ${task.start_number}..${task.stop_number} for task ${task.uid} in ${
          (end - start).toFixed(0)
        } ms, found ${(twins ?? []).length}x2 twins`,
      );
    }

    const result = `[${twins.join(",")}]`;

    const storeResult = await microgrid.taskStoreResult({
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
