/**
 * Compiled by `tsc`, never run. For each kind that has a `define*`, every field of the kind's file
 * (the generated body, from the same JSON Schema as `schemas/files/`), top level and nested, is a
 * field of what the `define*` takes, unless it is excused below with the reason. A field added to a
 * kind that its `define*` does not take is an error here, on the `Expect` of that kind.
 */
import type {
  AppOptions,
  BindingOptions,
  ConnectionGroupOptions,
  ConnectionOptions,
  ConnectorOptions,
  DashboardOptions,
  DataSourceOptions,
  EventOptions,
  EventTriggerOptions,
  FlowNode,
  FlowOptions,
  FormOptions,
  InterfaceOptions,
  KindBodies as K,
  QueryOptions,
  RoleOptions,
  ScheduleOptions,
  ScriptOptions,
  TableOptions,
  ThemeOptions,
  TriggerSourceOptions,
  VariableOptions,
  WebhookOptions,
  z,
} from "@volvel/sdk";

/** The paths of an object type's fields, `a.b`, and `a[]` for the items of a list. */
type Paths<T, P extends string = "", D extends unknown[] = []> = D["length"] extends 7
  ? never
  : T extends (...args: never[]) => unknown
    ? never
    : T extends { _zod: unknown }
      ? never
      : T extends readonly (infer E)[]
        ? Paths<E, `${P}[]`, [...D, 0]>
        : T extends object
          ? string extends keyof T
            ? never
            : {
                [Key in keyof T & string]-?:
                  | `${P}${P extends "" ? "" : "."}${Key}`
                  | Paths<NonNullable<T[Key]>, `${P}${P extends "" ? "" : "."}${Key}`, [...D, 0]>;
              }[keyof T & string]
          : never;

/** The fields of `Body` that `Options` does not take, and that are not excused. Never when they all are. */
type Missing<Body, Options, Excused extends string = never> = Exclude<
  Paths<Body>,
  Paths<Options> | Excused
>;
type Expect<_T extends never> = true;

type Any = z.ZodType;
type Columns = Record<string, never>;

// The fields below are taken in another form: a script's `uses` is written flat beside the other options.
type ScriptUsesPaths = `uses${"" | `.${string}`}`;

export type Parity = [
  Expect<Missing<K.AppBody, AppOptions>>,
  Expect<Missing<K.BindingBody, BindingOptions>>,
  Expect<Missing<K.ConnectionBody, ConnectionOptions>>,
  Expect<Missing<K.ConnectionGroupBody, ConnectionGroupOptions>>,
  Expect<Missing<K.ConnectorBody, ConnectorOptions<unknown, unknown>>>,
  Expect<Missing<K.DataSourceBody, DataSourceOptions, "connector">>,
  Expect<Missing<K.EventBody, EventOptions<Any>>>,
  Expect<
    Missing<
      // A flow's edges are written as tuples, `[from, to, { when, error }]`.
      K.FlowBody,
      FlowOptions<Record<string, FlowNode>>,
      "edges[].from" | "edges[].to" | "edges[].output" | "edges[].error"
    >
  >,
  Expect<Missing<K.DashboardBody, DashboardOptions>>,
  Expect<Missing<K.InterfaceBody, InterfaceOptions>>,
  Expect<Missing<K.QueryBody, QueryOptions>>,
  Expect<Missing<K.RoleBody, RoleOptions>>,
  Expect<Missing<K.ScheduleBody, ScheduleOptions>>,
  Expect<Missing<K.ScriptBody, ScriptOptions<Any, Any>, ScriptUsesPaths | "schemaSource">>,
  Expect<
    Missing<
      // A table's policy is `{ owner }` or `{ rules }`, and the type is said by which.
      K.TableBody,
      TableOptions<Record<string, never>>,
      "policy.type" | "policy.column"
    >
  >,
  Expect<Missing<K.ThemeBody, ThemeOptions>>,
  Expect<Missing<Extract<K.TriggerBody, { type: "event" }>, EventTriggerOptions, "type">>,
  Expect<Missing<Extract<K.TriggerBody, { type: "webhook" }>, WebhookOptions, "type">>,
  Expect<
    Missing<Extract<K.TriggerBody, { type: "form" }>, FormOptions, "type" | "script" | "enabled">
  >,
  Expect<Missing<K.TriggerSourceBody, TriggerSourceOptions, "uses" | `uses.${string}`>>,
  Expect<Missing<K.VariableBody, VariableOptions>>,
];

export type { Columns };
