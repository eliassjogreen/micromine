import { LoginMessage, Microgrid } from "./microgrid.ts";

import { BufReader, exists } from "./deps.ts";
import { Miner } from "./miner.ts";

const decoder = new TextDecoder();

async function readLine(stdin: Deno.Reader = Deno.stdin) {
  const reader = BufReader.create(stdin);
  const line = await reader.readLine();
  if (line === null) {
    return "";
  }

  return decoder.decode(line.line);
}

let grid;

if (await exists("./session.json")) {
  console.log("Found session.json");

  const session = JSON.parse(await Deno.readTextFile("./session.json")) as {
    sessionId: string;
    token: string;
  };

  grid = new Microgrid(session.sessionId, session.token);
} else {
  console.log("Didn't find session.json");

  grid = new Microgrid();
  await grid.ready;

  console.log("Initialized new session");
  console.log("Session id : " + grid.sessionId);
  console.log("Token      : " + grid.token);

  console.log("Enter username: ");
  const username = await readLine();
  console.log("Enter password: ");
  const password = await readLine();

  console.log("Downloading captcha");
  const captchaImage = await grid.captcha();
  if (!captchaImage) {
    throw "Could not get captcha";
  }

  console.log("Downloaded captcha, writing to captcha.png");
  await Deno.writeFile("captcha.png", captchaImage);
  console.log("Enter captcha: ");
  const captchaCode = await readLine();

  console.log("Logging in...");
  const loginResult = await grid.login({
    login: username,
    password: password,
    captcha: captchaCode,
  });

  console.log(`Login result: ${LoginMessage[loginResult]}`);

  if (loginResult !== LoginMessage.LoginSuccessful) {
    console.log("Login failed, exiting...");
    Deno.exit(1);
  } else {
    console.log("Login successful, saving session to session.json");
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
