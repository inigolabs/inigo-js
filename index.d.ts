import type { Type } from "@adam_inigo/ref-napi";
import type { StructType } from "ref-struct-di";

export const InigoConfig: StructType<{
  Debug: Type<boolean>;
  Ingest: Type<string>;
  Service: Type<string>;
  Token: Type<string>;
  Schema: Type<string>;
  Storage: Type<string>;
}>;

export function InigoPlugin(config: ReturnType<typeof InigoConfig>): any;

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