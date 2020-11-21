import { exists, parse } from "./deps.ts";

import { LoginMessage, Microgrid } from "./microgrid.ts";
import { Miner } from "./miner.ts";
import { error, log } from "./log.ts";

const args = parse(Deno.args, {
  alias: {
    s: "session",
    t: "threads",
    b: "batches",
  },
  default: {
    session: "./session.json",
  },
});

let grid;

log("           _                          _");
log("          (_)                        (_)");
log(" _ __ ___  _  ___ _ __ ___  _ __ ___  _ _ __   ___");
log("| '_ ` _ \\| |/ __| '__/ _ \\| '_ ` _ \\| | '_ \\ / _ \\");
log("| | | | | | | (__| | | (_) | | | | | | | | | |  __/");
log("|_| |_| |_|_|\\___|_|  \\___/|_| |_| |_|_|_| |_|\\___|");

if (await exists(args.session)) {
  log(`Found session (${args.session})`);

  const session = JSON.parse(await Deno.readTextFile(args.session));
  grid = new Microgrid(session.id, session.token);

  log(`Restored session (${args.session})`);
  log(`Session id : ${grid.sessionId}`);
  log(`Token      : ${grid.token}`);
} else {
  log(`Didn't find session (${args.session})`);

  grid = new Microgrid();
  await grid.ready;

  log("Initialized new session");
  log(`Session id : ${grid.sessionId}`);
  log(`Token      : ${grid.token}`);

  const login = prompt("[--] Enter username: ");
  if (!login) {
    error("Expected username");
  }

  const password = prompt("[--] Enter password: ");
  if (!password) {
    error("Expected password");
  }

  log("Downloading captcha");
  const captchaImage = await grid.captcha();
  if (!captchaImage) {
    error("Could not get captcha");
  }

  log("Downloaded captcha, writing to captcha.png");
  await Deno.writeFile("captcha.png", captchaImage);
  const captcha = prompt("[--] Enter captcha: ");
  if (!captcha) {
    error("Expected captcha");
  }

  log("Logging in...");
  const loginResult = await grid.login({ login, password, captcha });

  log(`Login result: ${LoginMessage[loginResult]}`);

  if (loginResult !== LoginMessage.Successful) {
    error("Login failed, exiting...");
  } else {
    log("Login successful");
    const answer = prompt("[--] Save session? (y/n): ")?.toLowerCase();

    if (answer?.startsWith("y")) {
      log(`Saving session to ${args.session}`);
      await Deno.writeTextFile(
        args.session,
        JSON.stringify({
          id: grid.sessionId,
          token: grid.token,
        }),
      );
    }
  }
}

const miner = new Miner(grid, args.threads, args.batches);
await miner.mine();
