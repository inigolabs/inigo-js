import { GraphQLDataSourceProcessOptions } from "@apollo/gateway/dist/datasources/types";
import { GatewayGraphQLRequestContext, GatewayGraphQLResponse } from "@apollo/server-gateway-interface";
import { ServiceEndpointDefinition } from "@apollo/gateway";

declare class Config {
  Debug?: boolean;
  Ingest?: string;
  Service?: string;
  Token?: string;
  Schema?: string;
  EgressUrl?: string;
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

interface InigoSubGraphInfo {
  name: string
  label: string
  url: string
  token: string
}
interface InigoGatewayInfo {
  [key: string]: InigoSubGraphInfo;
}

export function InigoFetchGatewayInfo(token?: string): InigoGatewayInfo;

export class InigoRemoteDataSource {
  constructor(info: InigoGatewayInfo, server: ServiceEndpointDefinition);

  onBeforeSendRequest?(options: GraphQLDataSourceProcessOptions): void | Promise<void>;
  onAfterReceiveResponse?(requestContext: Required<Pick<GatewayGraphQLRequestContext, 'request' | 'response' | 'context'>>): GatewayGraphQLResponse | Promise<GatewayGraphQLResponse>;
}
