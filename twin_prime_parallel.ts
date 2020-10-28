import { parry } from "./deps.ts";
import { check } from "./twin_prime.ts";

export async function checkParallel(
  start: number,
  stop: number,
  threads: number = Deno.systemCpuInfo().cores ?? 4,
): Promise<number[]> {
  const totalRange = stop - start;
  const threadRange = Math.floor(totalRange / threads);
  const promises: Promise<number[]>[] = [];
  const workers = new Array(threads).fill(undefined).map((_) => parry(check));

  for (let i = 0; i < threads; i++) {
    promises.push(
      workers[i](
        start + threadRange * i,
        start + threadRange * (i + 1),
      ),
    );
  }

  const result = (await Promise.all(promises)).flat();

  for (const worker of workers) {
    worker.close();
  }

  return result;
}
