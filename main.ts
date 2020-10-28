import { exists } from "./deps.ts";

import { LoginMessage, Microgrid } from "./microgrid.ts";
import { Miner } from "./miner.ts";
import { error, log } from "./log.ts";

let grid;

log("           _                          _");
log("          (_)                        (_)");
log(" _ __ ___  _  ___ _ __ ___  _ __ ___  _ _ __   ___");
log("| '_ ` _ \\| |/ __| '__/ _ \\| '_ ` _ \\| | '_ \\ / _ \\");
log("| | | | | | | (__| | | (_) | | | | | | | | | |  __/");
log("|_| |_| |_|_|\\___|_|  \\___/|_| |_| |_|_|_| |_|\\___|");

if (await exists("./session.json")) {
  console.log("Found session.json");

  const session = JSON.parse(await Deno.readTextFile("./session.json")) as {
    sessionId: string;
    token: string;
  };

  grid = new Microgrid(session.sessionId, session.token);
} else {
  log("Didn't find session.json");

  grid = new Microgrid();
  await grid.ready;

  log("Initialized new session");
  log("Session id : " + grid.sessionId);
  log("Token      : " + grid.token);

  const login = prompt("Enter username: ");
  if (!login) {
    error("Expected username");
  }

  const password = prompt("Enter password: ");
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
  const captcha = prompt("Enter captcha: ");
  if (!captcha) {
    error("Expected captcha");
  }

  log("Logging in...");
  const loginResult = await grid.login({ login, password, captcha });

  log(`Login result: ${LoginMessage[loginResult]}`);

  if (loginResult !== LoginMessage.LoginSuccessful) {
    error("Login failed, exiting...");
  } else {
    log("Login successful, saving session to session.json");
    await Deno.writeTextFile(
      "./session.json",
      JSON.stringify({
        id: grid.sessionId,
        token: grid.token,
      }),
    );
  }
}

const miner = new Miner(grid);
await miner.mine();
