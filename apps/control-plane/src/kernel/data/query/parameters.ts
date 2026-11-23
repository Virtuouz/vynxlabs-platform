import { parameterMisfit, type QueryParameter } from "@volvel/manifest";
import { badRequest } from "../../errors.js";

/**
 * What a saved query is given, read from what the caller supplied: one value for each parameter
 * it declares, in order. The saved-query route and a widget over a saved query both read them here,
 * so the one refuses what the other refuses, in the same words.
 */
export function readParameters(
  declared: readonly QueryParameter[],
  /** The value supplied for a name, or undefined when none was. */
  supplied: (name: string) => unknown,
  /** The names the caller gave, to refuse one the query does not have. */
  names: readonly string[],
  options: {
    /** Where a problem is placed, for a name. */
    at: (name: string) => string;
    /** What is said of a required parameter that has no value. */
    missing?: (parameter: QueryParameter) => string;
  },
): unknown[] {
  const unknown = names.find((name) => !declared.some((one) => one.name === name));
  if (unknown !== undefined) {
    throw badRequest("The query has no such parameter.", [
      { path: options.at(unknown), message: `there is no parameter "${unknown}"` },
    ]);
  }
  return declared.map((parameter) => {
    const given = supplied(parameter.name);
    const value = given === undefined || given === null ? (parameter.default ?? null) : given;
    if (value === null) {
      if (parameter.required) {
        const message = options.missing?.(parameter);
        throw badRequest(message ?? "A parameter is missing.", [
          { path: options.at(parameter.name), message: message ?? "a value is required" },
        ]);
      }
      return null;
    }
    const problem = parameterMisfit(parameter.type, value);
    if (problem) {
      throw badRequest("A parameter does not fit.", [
        { path: options.at(parameter.name), message: `must be ${problem}` },
      ]);
    }
    return value;
  });
}
