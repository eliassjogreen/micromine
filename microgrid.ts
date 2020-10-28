import { Cookie } from "./cookie.ts";
import { deferred } from "./deps.ts";

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

export interface TaskStoreResultOptions {
  version: number;
  workunit_result_uid: number;
  result:
    | number[]
    | {
      results: number[];
      validation_hash: number;
    }
    | object;
}

export interface TaskStoreResultResult {
  result: string;
  message?: string;
}

export enum LoginMessage {
  LoginFailed,
  LoginFailedWrongToken,
  LoginFailedInvalidCaptcha,
  LoginSuccessful,
  LoginFailedRequest,
}

export enum RegisterMessage {
  RegisterFailed,
  RegisterFailedWrongToken,
  RegisterFailedDisabled,
  RegisterFailedPasswordMismatch,
  RegisterFailedInvalidCaptcha,
  RegisterFailedInvalidPassword,
  RegisterFailedInvalidLogin,
  RegisterLoginSuccessful,
  RegisterSuccessful,
}

export enum LogoutMessage {
  LogoutFailed,
  LogoutFailedWrongToken,
  LogoutSuccessful,
}

export enum UserChangeSettingsMessage {
  UserChangeSettingsFailed,
  UserChangeSettingsFailedWrongToken,
  UserChangeSettingsFailedNewPasswordMismatch,
  UserChangeSettingsFailedPasswordIncorrect,
  UserChangeSettingsSuccessful,
}

export enum GetNewTaskMessage {
  GetNewTaskFailed,
  GetNewTaskFailedWrongToken,
  GetNewTaskFailedIncorrectBody,
  GetNewTaskSuccessful,
}

export enum TaskStoreResultMessage {
  TaskStoreResultFailed,
  TaskStoreResultFailedWrongToken,
  TaskStoreResultFailedWrongVersion,
  TaskStoreResultSuccessful,
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
    baseUrl: string = "https://microgrid.arikado.ru/",
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
      headers: headers,
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
      headers: headers,
    });

    if (response.headers.get("content-type") === "image/png") {
      return (await response.body?.getReader().read())?.value;
    }

    return undefined;
  }

  public async projectScript(
    projectScript: number,
  ): Promise<string | undefined> {
    const headers = new Headers();
    headers.append(
      "Cookie",
      new Cookie("session_id", this.sessionId).toString(),
    );

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
    headers.append(
      "Origin",
      this.baseUrl,
    );
    headers.append(
      "Referer",
      this.baseUrl,
    );

    const body = new URLSearchParams({
      action: "login",
      token: this.token,
      login: options.login,
      password: options.password,
      captcha_code: options.captcha,
    }).toString();

    // const agent = createAgent(options.baseUrl);
    // const response = await agent.send({
    //   method: "POST",
    //   headers: headers,
    //   body: body.toString(),
    //   path: "/"
    // });

    // TODO: fix login, redirect fucks this up somehow and servest createAgent is broken
    const response = await fetch(`${this.baseUrl}#login`, {
      method: "POST",
      headers,
      body,
    });

    console.log(response);

    if ((await response.text()) === "Wrong token") {
      return LoginMessage.LoginFailedWrongToken;
    }

    if (response.headers.has("set-cookie")) {
      const cookie = Cookie.FromString(
        "message",
        response.headers.get("set-cookie")!,
      );

      if (cookie) {
        switch (cookie.value) {
          case "login_failed_invalid_captcha":
            return LoginMessage.LoginFailedInvalidCaptcha;
          case "login_successful":
            return LoginMessage.LoginSuccessful;
        }
      }
    }

    return LoginMessage.LoginFailed;
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
      headers: headers,
      body: body,
    });

    if ((await response.text()) === "Wrong token") {
      return RegisterMessage.RegisterFailedWrongToken;
    }

    if (response.headers.has("set-cookie")) {
      const cookie = Cookie.FromString(
        "message",
        response.headers.get("set-cookie")!,
      );

      if (cookie) {
        switch (cookie.value) {
          case "register_failed_invalid_captcha":
            return RegisterMessage.RegisterFailedInvalidCaptcha;
          case "register_failed_disabled":
            return RegisterMessage.RegisterFailedDisabled;
          case "register_failed_password_mismatch":
            return RegisterMessage.RegisterFailedPasswordMismatch;
          case "register_failed_invalid_password":
            return RegisterMessage.RegisterFailedInvalidPassword;
          case "register_failed_invalid_login":
            return RegisterMessage.RegisterFailedInvalidLogin;
          case "login_successful":
            return RegisterMessage.RegisterLoginSuccessful;
          case "register_successful":
            return RegisterMessage.RegisterSuccessful;
        }
      }
    }

    return RegisterMessage.RegisterFailed;
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
      headers: headers,
      body: body,
    });

    if ((await response.text()) === "Wrong token") {
      return LogoutMessage.LogoutFailedWrongToken;
    }

    if (response.headers.has("set-cookie")) {
      const cookie = Cookie.FromString(
        "message",
        response.headers.get("set-cookie")!,
      );

      if (cookie && cookie.value === "logout_successful") {
        return LogoutMessage.LogoutSuccessful;
      }
    }

    return LogoutMessage.LogoutFailed;
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
      headers: headers,
      body: body,
    });

    const responseBody = await response.text();

    if (responseBody === "Wrong token") {
      return {
        message: GetNewTaskMessage.GetNewTaskFailedWrongToken,
      };
    } else {
      try {
        const json: object = JSON.parse(responseBody, (key, value) => {
          return isNaN(value) ? value : parseInt(value);
        });

        if (
          (json as Task).workunit_result_uid !== undefined &&
          (json as Task).uid !== undefined &&
          (json as Task).project_uid !== undefined &&
          (json as Task).start_number !== undefined &&
          (json as Task).stop_number !== undefined &&
          typeof (json as Task).workunit_result_uid === "number" &&
          typeof (json as Task).uid === "number" &&
          typeof (json as Task).project_uid === "number" &&
          typeof (json as Task).start_number === "number" &&
          typeof (json as Task).stop_number === "number"
        ) {
          return {
            message: GetNewTaskMessage.GetNewTaskSuccessful,
            task: json as Task,
          };
        }
      } catch {
        return {
          message: GetNewTaskMessage.GetNewTaskFailedIncorrectBody,
        };
      }
    }

    return {
      message: GetNewTaskMessage.GetNewTaskFailed,
    };
  }

  public async taskStoreResult(
    options: TaskStoreResultOptions,
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
      result: JSON.stringify(options.result),
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: headers,
      body: body,
    });

    const responseBody = await response.text();

    if (responseBody === "Wrong token") {
      return TaskStoreResultMessage.TaskStoreResultFailedWrongToken;
    } else {
      try {
        const json: object = JSON.parse(responseBody);

        if (
          (json as TaskStoreResultResult).result !== undefined &&
          typeof (json as TaskStoreResultResult).result === "string"
        ) {
          switch ((json as TaskStoreResultResult).result) {
            case "fail":
              return TaskStoreResultMessage.TaskStoreResultFailedWrongVersion;
            case "ok":
              return TaskStoreResultMessage.TaskStoreResultSuccessful;
          }
        }
      } catch {
        return TaskStoreResultMessage.TaskStoreResultFailed;
      }
    }

    return TaskStoreResultMessage.TaskStoreResultFailed;
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
      headers: headers,
      body: body,
    });

    if ((await response.text()) === "Wrong token") {
      return UserChangeSettingsMessage.UserChangeSettingsFailedWrongToken;
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
              .UserChangeSettingsFailedNewPasswordMismatch;
          case "user_change_settings_failed_password_incorrect":
            return UserChangeSettingsMessage
              .UserChangeSettingsFailedPasswordIncorrect;
          case "user_change_settings_successful":
            return UserChangeSettingsMessage.UserChangeSettingsSuccessful;
        }
      }
    }

    return UserChangeSettingsMessage.UserChangeSettingsFailed;
  }
}
