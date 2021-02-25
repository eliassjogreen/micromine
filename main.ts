import { exists, log, parse } from "./deps.ts";

import { LoginMessage, Microgrid } from "./src/microgrid.ts";
import { mine } from "./src/miner.ts";

const args = parse(Deno.args, {
  alias: {
    session: "s",
    threads: "t",
    attempts: "a",
    cooldown: "c",
  },
  default: {
    session: "./session.json",
  },
});

let microgrid;

log.info("           _                          _");
log.info("          (_)                        (_)");
log.info(" _ __ ___  _  ___ _ __ ___  _ __ ___  _ _ __   ___");
log.info("| '_ ` _ \\| |/ __| '__/ _ \\| '_ ` _ \\| | '_ \\ / _ \\");
log.info("| | | | | | | (__| | | (_) | | | | | | | | | |  __/");
log.info("|_| |_| |_|_|\\___|_|  \\___/|_| |_| |_|_|_| |_|\\___|");

if (await exists(args.session)) {
  log.info(`Found session (${args.session})`);

  const session = JSON.parse(await Deno.readTextFile(args.session));
  microgrid = new Microgrid(session.id, session.token);

  log.info(`Restored session (${args.session})`);
  log.info(`Session id : ${microgrid.sessionId}`);
  log.info(`Token      : ${microgrid.token}`);
} else {
  log.info(`Didn't find session (${args.session})`);

  microgrid = new Microgrid();
  await microgrid.ready;

  log.info("Initialized new session");
  log.info(`Session id : ${microgrid.sessionId}`);
  log.info(`Token      : ${microgrid.token}`);

  const login = prompt("[--] Enter username: ");
  if (!login) {
    log.error("Expected username");
    Deno.exit(1);
  }

  const password = prompt("[--] Enter password: ");
  if (!password) {
    log.error("Expected password");
    Deno.exit(1);
  }

  log.info("Downloading captcha");
  const captchaImage = await microgrid.captcha();
  if (!captchaImage) {
    log.error("Could not get captcha");
    Deno.exit(1);
  }

  log.info("Downloaded captcha, writing to captcha.png");
  await Deno.writeFile("captcha.png", captchaImage);
  const captcha = prompt("[--] Enter captcha: ");
  if (!captcha) {
    log.error("Expected captcha");
    Deno.exit(1);
  }

  log.info("Logging in...");
  const loginResult = await microgrid.login({ login, password, captcha });

  log.info(`Login result: ${LoginMessage[loginResult]}`);

  if (loginResult !== LoginMessage.Successful) {
    log.error("Login failed, exiting...");
  } else {
    log.info("Login successful");
    const answer = prompt("[--] Save session? (y/n): ")?.toLowerCase();

    if (answer?.startsWith("y")) {
      log.info(`Saving session to ${args.session}`);
      await Deno.writeTextFile(
        args.session,
        JSON.stringify({
          id: microgrid.sessionId,
          token: microgrid.token,
        }),
      );
    }
  }
}

await mine(microgrid, args.threads, args.attempts, args.cooldown);
