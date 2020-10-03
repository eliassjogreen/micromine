export class Cookie {
  public readonly name: string;
  public readonly value: string;

  constructor(name: string, value: string) {
    this.name = name;
    this.value = value;
  }

  public toString(): string {
    return `${this.name}=${this.value}`;
  }

  public static FromString(name: string, cookie: string): Cookie {
    const parts = `; ${cookie}`.split(`; ${name}=`);

    if (parts.length === 2) {
      return new Cookie(name, parts.pop()!.split(";").shift()!);
    }

    throw "Could not parse cookie";
  }
}
