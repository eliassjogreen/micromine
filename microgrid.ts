import { Cookie } from "./cookie.ts";
import { deferred, createAgent } from "./deps.ts";

export interface MicrogridOptions {
  baseUrl: string;
  sessionId: string;
  token: string;
}

export interface LoginOptions {
  captcha: string;
  login: string;
  password: string;
}

export interface RegisterOptions {
  captcha: string;
  login: string;
  mail: string;
  password1: string;
  password2: string;
  withdrawAddress: string;
}

export interface UserChangeSettingsOptions {
  mail: string;
  password: string;
  newPassword1: string;
  newPassword2: string;
  withdrawAddress: string;
}

export interface GetNewTaskOptions {
  project: number;
}

export interface Task {
  workunit_result_uid: number;
  uid: number;
  project_uid: number;
  start_number: number;
  stop_number: number;
}

export interface GetNewTaskResult {
  message: GetNewTaskMessage;
  task?: Task;
}

export interface ResultOptions {
  version: number;
  workunit_result_uid: number;
  result:
    | number[]
    | bigint[]
    | {
      results: number[];
      validation_hash: number;
    }
    | object
    | string;
}

export interface ResultResult {
  result: string;
  message?: string;
}

export enum LoginMessage {
  Failed,
  FailedWrongToken,
  FailedInvalidCaptcha,
  Successful,
  FailedRequest,
}

export enum RegisterMessage {
  Failed,
  FailedWrongToken,
  FailedDisabled,
  FailedPasswordMismatch,
  FailedInvalidCaptcha,
  FailedInvalidPassword,
  FailedInvalidLogin,
  LoginSuccessful,
  Successful,
}

export enum LogoutMessage {
  Failed,
  FailedWrongToken,
  Successful,
}

export enum UserChangeSettingsMessage {
  Failed,
  FailedWrongToken,
  FailedNewPasswordMismatch,
  FailedPasswordIncorrect,
  Successful,
}

export enum GetNewTaskMessage {
  Failed,
  FailedWrongToken,
  FailedIncorrectBody,
  Successful,
}

export enum TaskStoreResultMessage {
  Failed,
  FailedWrongToken,
  FailedWrongVersion,
  Successful,
}

export class Microgrid {
  public readonly baseUrl: string;
  public readonly ready: Promise<void>;

  public get sessionId(): string {
    return this.#sessionId;
  }

  public get token(): string {
    return this.#token;
  }

  #sessionId: string = "";
  #token: string = "";

  constructor(
    sessionId?: string,
    token?: string,
    baseUrl: string = "https://microgrid.arikado.ru/"
  ) {
    this.baseUrl = baseUrl;
    let ready = deferred();
    this.ready = ready as Promise<void>;

    if (sessionId === undefined || token === undefined) {
      this.getSessionId().then((id) => {
        if (id === undefined) {
          throw new Error("Could not get session id");
        }

        this.#sessionId = id;
        this.getToken(id).then((tok) => {
          if (tok === undefined) {
            throw new Error("Could not get token");
          }

          this.#token = tok;
          ready.resolve();
        });
      });
    } else {
      this.#sessionId = sessionId;
      this.#token = token;
    }
  }

  public async getSessionId(): Promise<string | undefined> {
    const response = await fetch(this.baseUrl, {
      method: "GET",
    });

    if (response.headers.has("set-cookie")) {
      const cookie = Cookie.FromString(
        "session_id",
        response.headers.get("set-cookie")!,
      );

      if (cookie) {
        return cookie.value;
      }
    }

    return undefined;
  }

  public async getToken(sessionId: string): Promise<string | undefined> {
    const headers = new Headers();
    headers.append("Cookie", new Cookie("session_id", sessionId).toString());

    const query = new URLSearchParams({
      ajax: "1",
      block: "login",
    }).toString();

    const response = await fetch(`${this.baseUrl}?${query}`, {
      method: "GET",
      headers,
    });

    const responseBody = await response.text();

    const tokenElement = responseBody.match(
      /<input type=hidden name=token value='(.*)'>/,
    );

    if (tokenElement && tokenElement.length === 2) {
      return tokenElement[1];
    }

    return undefined;
  }

  public async captcha(): Promise<Uint8Array | undefined> {
    const headers = new Headers();
    headers.append(
      "Cookie",
      new Cookie("session_id", this.sessionId).toString(),
    );

    const response = await fetch(`${this.baseUrl}?captcha`, {
      method: "GET",
      headers,
    });

    if (response.headers.get("content-type") === "image/png") {
      return (await response.body?.getReader().read())?.value;
    }

    return undefined;
  }

  public async projectScript(
    projectScript: number,
  ): Promise<string | undefined> {
    const response = await fetch(
      `${this.baseUrl}?project_script=${projectScript.toString()}`,
      {
        method: "GET",
      },
    );

    if (response.headers.get("content-type") === "application/javascript") {
      return response.text();
    }

    return undefined;
  }

  public async login(options: LoginOptions): Promise<LoginMessage> {
    const headers = new Headers();
    headers.append(
      "Cookie",
      new Cookie("session_id", this.sessionId).toString(),
    );
    headers.append(
      "Content-Type",
      "application/x-www-form-urlencoded; charset=UTF-8",
    );

    const body = new URLSearchParams({
      action: "login",
      token: this.token,
      login: options.login,
      password: options.password,
      captcha_code: options.captcha,
    }).toString();

    // This really sucks, but it works...
    const agent = createAgent(this.baseUrl);
    const response = await agent.send({
      method: "POST",
      headers,
      body,
      path: "/"
    });

    // TODO: fix login, cors is a bitch
    // const response = await fetch(`${this.baseUrl}#login`, {
    //  method: "POST",
    //  headers,
    //  body,
    // });

    if ((await response.text()) === "Wrong token") {
      return LoginMessage.FailedWrongToken;
    }

    if (response.headers.has("set-cookie")) {
      const cookie = Cookie.FromString(
        "message",
        response.headers.get("set-cookie")!,
      );

      if (cookie) {
        switch (cookie.value) {
          case "login_failed_invalid_captcha":
            return LoginMessage.FailedInvalidCaptcha;
          case "login_successful":
            return LoginMessage.Successful;
        }
      }
    }

    return LoginMessage.Failed;
  }

  public async register(options: RegisterOptions): Promise<RegisterMessage> {
    const headers = new Headers();
    headers.append(
      "Cookie",
      new Cookie("session_id", this.sessionId).toString(),
    );

    const body = new URLSearchParams({
      action: "register",
      token: this.token,
      captcha_code: options.captcha,
      login: options.login,
      mail: options.mail,
      password1: options.password1,
      password2: options.password2,
      withdraw_address: options.withdrawAddress,
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body,
    });

    if ((await response.text()) === "Wrong token") {
      return RegisterMessage.FailedWrongToken;
    }

    if (response.headers.has("set-cookie")) {
      const cookie = Cookie.FromString(
        "message",
        response.headers.get("set-cookie")!,
      );

      if (cookie) {
        switch (cookie.value) {
          case "register_failed_invalid_captcha":
            return RegisterMessage.FailedInvalidCaptcha;
          case "register_failed_disabled":
            return RegisterMessage.FailedDisabled;
          case "register_failed_password_mismatch":
            return RegisterMessage.FailedPasswordMismatch;
          case "register_failed_invalid_password":
            return RegisterMessage.FailedInvalidPassword;
          case "register_failed_invalid_login":
            return RegisterMessage.FailedInvalidLogin;
          case "login_successful":
            return RegisterMessage.LoginSuccessful;
          case "register_successful":
            return RegisterMessage.Successful;
        }
      }
    }

    return RegisterMessage.Failed;
  }

  public async logout(): Promise<LogoutMessage> {
    const headers = new Headers();
    headers.append(
      "Cookie",
      new Cookie("session_id", this.sessionId).toString(),
    );

    const body = new URLSearchParams({
      action: "logout",
      token: this.token,
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body,
    });

    if ((await response.text()) === "Wrong token") {
      return LogoutMessage.FailedWrongToken;
    }

    if (response.headers.has("set-cookie")) {
      const cookie = Cookie.FromString(
        "message",
        response.headers.get("set-cookie")!,
      );

      if (cookie && cookie.value === "logout_successful") {
        return LogoutMessage.Successful;
      }
    }

    return LogoutMessage.Failed;
  }

  public async getNewTask(
    options: GetNewTaskOptions,
  ): Promise<GetNewTaskResult> {
    const headers = new Headers();
    headers.append(
      "Cookie",
      new Cookie("session_id", this.sessionId).toString(),
    );

    const body = new URLSearchParams({
      action: "get_new_task",
      token: this.token,
      project: options.project.toString(),
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body,
    });

    const responseBody = await response.text();

    if (responseBody === "Wrong token") {
      return {
        message: GetNewTaskMessage.FailedWrongToken,
      };
    } else {
      try {
        const json: Task = JSON.parse(responseBody, (key, value) => {
          return isNaN(value) ? value : parseInt(value);
        });

        if (
          typeof json.workunit_result_uid === "number" &&
          typeof json.uid === "number" &&
          typeof json.project_uid === "number" &&
          typeof json.start_number === "number" &&
          typeof json.stop_number === "number"
        ) {
          return {
            message: GetNewTaskMessage.Successful,
            task: json,
          };
        }
      } catch {
        return {
          message: GetNewTaskMessage.FailedIncorrectBody,
        };
      }
    }

    return {
      message: GetNewTaskMessage.Failed,
    };
  }

  public async taskStoreResult(
    options: ResultOptions,
  ): Promise<TaskStoreResultMessage> {
    const headers = new Headers();
    headers.append(
      "Cookie",
      new Cookie("session_id", this.sessionId).toString(),
    );

    const body = new URLSearchParams({
      action: "task_store_result",
      token: this.token,
      version: options.version.toString(),
      workunit_result_uid: options.workunit_result_uid.toString(),
      result: typeof options.result === "string"
        ? options.result
        : JSON.stringify(options.result),
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body,
    });

    const responseBody = await response.text();

    if (responseBody === "Wrong token") {
      return TaskStoreResultMessage.FailedWrongToken;
    } else {
      try {
        const json: ResultResult = JSON.parse(responseBody);

        if (
          json.result !== undefined &&
          typeof json.result === "string"
        ) {
          switch (json.result) {
            case "fail":
              return TaskStoreResultMessage.FailedWrongVersion;
            case "ok":
              return TaskStoreResultMessage.Successful;
          }
        }
      } catch {
        return TaskStoreResultMessage.Failed;
      }
    }

    return TaskStoreResultMessage.Failed;
  }

  public async userChangeSettings(
    options: UserChangeSettingsOptions,
  ): Promise<UserChangeSettingsMessage> {
    const headers = new Headers();
    headers.append(
      "Cookie",
      new Cookie("session_id", this.sessionId).toString(),
    );

    const body = new URLSearchParams({
      action: "user_change_settings",
      token: this.token,
      mail: options.mail,
      password: options.password,
      new_password1: options.newPassword1,
      new_password2: options.newPassword2,
      withdraw_address: options.withdrawAddress,
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body,
    });

    if ((await response.text()) === "Wrong token") {
      return UserChangeSettingsMessage.FailedWrongToken;
    }

    if (response.headers.has("set-cookie")) {
      const cookie = Cookie.FromString(
        "message",
        response.headers.get("set-cookie")!,
      );

      if (cookie) {
        switch (cookie.value) {
          case "user_change_settings_failed_new_password_mismatch":
            return UserChangeSettingsMessage
              .FailedNewPasswordMismatch;
          case "user_change_settings_failed_password_incorrect":
            return UserChangeSettingsMessage
              .FailedPasswordIncorrect;
          case "user_change_settings_successful":
            return UserChangeSettingsMessage.Successful;
        }
      }
    }

    return UserChangeSettingsMessage.Failed;
  }
}
