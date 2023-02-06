declare class Config {
  Debug?: boolean;
  Ingest?: string;
  Service?: string;
  Token?: string;
  Schema?: string;
  Storage?: string;
}

export class InigoConfig extends Config {
  constructor(cfg: Config);
}

export function InigoPlugin(config?: Config): any;

interface InigoError {
  message: string;
}

export interface InigoAuthContext extends Record<string, any> {
  readonly req: Record<string, any> & {
    readonly inigo: {
      ctx?: any;
      jwt?: string;
    }
  }
}

export interface InigoProcessedContext extends Record<string, any> {
  readonly inigo: {
    readonly blocked: boolean;
    readonly result: {
      readonly status: string;
      readonly errors: InigoError[]
    };
  }
}

export function version(): string;