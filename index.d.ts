import { GraphQLDataSourceProcessOptions } from "@apollo/gateway/dist/datasources/types";
import { GatewayGraphQLRequestContext, GatewayGraphQLResponse } from "@apollo/server-gateway-interface";
import { ServiceEndpointDefinition, RemoteGraphQLDataSource, SupergraphManager, SupergraphSdlHook } from "@apollo/gateway";

declare class Config {
  Disabled?: boolean;
  Token?: string;
  Schema?: string;
  SkipNonHTTPRequests?: boolean;
}

export class InigoConfig extends Config {
  constructor(cfg: Config);
}

export function InigoPlugin(config?: Config): any;

export function YogaInigoPlugin(config?: Config): any;

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

export class Inigo {
  constructor(cfg?: Config);
  plugin(): any;
}

interface InigoGatewayInfo {
  [key: string]: InigoSubGraphInfo;
}

export function InigoFetchGatewayInfo(token?: string): Promise<InigoGatewayInfo>;

type DataSourceConstructor = new (...args: any[]) => any // GraphQLDataSource;
export function InigoDataSourceMixin(superclass: DataSourceConstructor, inigo?: Inigo): any; // GraphQLDataSource

export class InigoRemoteDataSource extends RemoteGraphQLDataSource {
  constructor(server: ServiceEndpointDefinition, info?: Inigo);

  onBeforeSendRequest?(options: GraphQLDataSourceProcessOptions): void | Promise<void>;
  onAfterReceiveResponse?(requestContext: Required<Pick<GatewayGraphQLRequestContext, 'request' | 'response' | 'context'>>): GatewayGraphQLResponse | Promise<GatewayGraphQLResponse>;
}

export enum InigoSchemaStatus {
  missing = "missing",
  unchanged = "unchanged",
  updated = "updated",
}

export type FetchFederationSchemaResponse = {
  registry: {
    federatedSchema: {
      status: InigoSchemaStatus,
      version: number,
      schema?: string,
    }
  }
}

export type InigoSchemaManagerOnInitError = (error: Error) => Promise<string>;
export type InigoSchemaManagerParams = {
  token?: string,
  endpoint?: string,
  onInitError?: InigoSchemaManagerOnInitError,
}

export class InigoSchemaManager implements SupergraphManager {
  constructor(params?: InigoSchemaManagerParams);

  initialize: SupergraphSdlHook;
}
