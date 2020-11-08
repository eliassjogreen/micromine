export function log(
  text: string,
  ids: (number | string)[] = [],
  thread: number | string = "--",
) {
  console.log(
    `[${
      typeof thread === "number" ? thread.toString().padStart(2, "0") : thread
    }]${ids.map((id) => `[${id}]`).join("")} ${text}`,
  );
}

export function error(
  text: string,
  ids: (number | string)[] = [],
  thread: number | string = "--",
): never {
  log(text, ids, thread);
  Deno.exit(1);
}
