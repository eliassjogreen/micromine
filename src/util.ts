export async function awaitKeypress(): Promise<void> {
  if (!Deno.isatty(Deno.stdin.rid)) {
    throw new Error("Keypress can be read only under TTY.");
  }

  while (true) {
    const buffer = new Uint8Array(1024);
    Deno.setRaw(Deno.stdin.rid, true);
    await Deno.stdin.read(buffer);
    Deno.setRaw(Deno.stdin.rid, false);

    return;
  }
}
