// GAS（google.script.run）とのやりとり。
// 試すとき（google が無いブラウザ）は、mock.ts の偽のサーバーを使います。

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const google: any;

export type BootResult =
  | { state: "nologin"; url: string }
  | { state: "denied"; email: string; message?: string; url: string }
  | {
      state: "staff";
      me: Record<string, unknown>;
      data: Record<string, Record<string, unknown>[]>;
      url: string;
      owner: string;
      version: string;
      now: number;
    }
  | {
      state: "ops";
      name: string;
      email: string;
      data: Record<string, Record<string, unknown>[]>;
      url: string;
      version: string;
      now: number;
    };

export type WriteOp = { col: string; id: string; doc: Record<string, unknown> | null };
export type WriteResult = { ok: boolean; warnings: string[]; now: number };

type Server = {
  boot(): Promise<BootResult>;
  write(ops: WriteOp[]): Promise<WriteResult>;
};

function call<T>(name: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((r: T) => resolve(r))
      .withFailureHandler((e: Error) => reject(e))
      [name](...args);
  });
}

export function hasGas(): boolean {
  return typeof google !== "undefined" && !!google.script && !!google.script.run;
}

let mock: Server | null = null;
export function setMockServer(s: Server) {
  mock = s;
}

export const server: Server = {
  boot: () => (mock ? mock.boot() : call<BootResult>("boot")),
  write: (ops) => (mock ? mock.write(ops) : call<WriteResult>("write", ops)),
};
