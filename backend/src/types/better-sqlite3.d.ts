declare module "better-sqlite3" {
  interface Statement {
    run(...params: any[]): Database.RunResult;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }

  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): this;
    pragma(pragma: string, options?: any): any;
    close(): void;
    transaction<T>(fn: () => T): () => T;
  }

  namespace Database {
    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }
  }

  class Database {
    constructor(filename: string, options?: any);
  }

  export = Database;
}
