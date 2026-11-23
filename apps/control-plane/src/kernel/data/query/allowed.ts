/**
 * The functions and types a query may name (Decision 0003, guard 2). Anything
 * not here is refused, which is how `set_config`, `pg_sleep`, `pg_read_file`,
 * `query_to_xml`, `dblink` and whatever a later Postgres adds are kept out.
 *
 * A function belongs here when it only works on the values it is given: it
 * reads no setting, no file, no catalog and no other session, changes
 * nothing, and cannot be made to wait.
 */

const words = (list: string) => list.split(/\s+/).filter(Boolean);

/** A group of the functions a query may name, with what they are for. */
export interface FunctionGroup {
  name: string;
  /** Said on the reference page. */
  description: string;
  functions: readonly string[];
}

export const FUNCTION_GROUPS: readonly FunctionGroup[] = [
  {
    name: "Aggregates",
    description: "Work out one value from many rows, for a total, a count or an average.",
    functions: words(`count sum avg min max bool_and bool_or every string_agg array_agg
    jsonb_agg json_agg jsonb_object_agg json_object_agg
    stddev stddev_pop stddev_samp variance var_pop var_samp
    corr covar_pop covar_samp regr_slope regr_intercept regr_r2 regr_count
    percentile_cont percentile_disc mode bit_and bit_or any_value`),
  },
  {
    name: "Window functions",
    description:
      "Look at the rows around a row, to rank them, number them or compare with the last.",
    functions: words(`row_number rank dense_rank percent_rank cume_dist ntile lag lead
    first_value last_value nth_value`),
  },
  {
    name: "Numbers",
    description: "Round, compare and calculate with numbers.",
    functions: words(`abs ceil ceiling floor round trunc sign mod power sqrt cbrt exp ln log log10
    greatest least div gcd lcm width_bucket numeric_inc pi degrees radians
    sin cos tan asin acos atan atan2`),
  },
  {
    name: "Text",
    description: "Cut, join, search and change the case of text.",
    functions: words(`lower upper initcap length char_length character_length octet_length
    btrim ltrim rtrim trim lpad rpad left right substr substring overlay position strpos
    replace translate repeat reverse concat concat_ws split_part starts_with
    string_to_array array_to_string regexp_replace regexp_match regexp_matches
    regexp_split_to_array regexp_split_to_table regexp_count regexp_like regexp_substr
    string_to_table format to_char to_number to_hex md5 ascii chr quote_literal
    unaccent normalize like_escape similar_to_escape similar_escape textlike texticlike`),
  },
  {
    name: "Dates and times",
    description:
      "Build, cut and move dates and times. `now` and its kin read the transaction's clock and nothing else.",
    functions: words(`now date_trunc date_part extract age make_date make_time make_timestamp
    make_timestamptz make_interval to_date to_timestamp timezone date_bin
    justify_days justify_hours justify_interval isfinite clock_timestamp
    statement_timestamp transaction_timestamp timeofday overlaps date_add date_subtract`),
  },
  {
    name: "Nulls and choices",
    description: "Pick the first value there is, or turn a value into null.",
    functions: words(`coalesce nullif num_nulls num_nonnulls`),
  },
  {
    name: "Arrays",
    description: "Build, search and unpack lists of values.",
    functions: words(`array_length array_position array_positions array_append array_prepend
    array_cat array_remove array_replace array_dims array_ndims array_lower array_upper
    cardinality unnest array_to_json generate_series generate_subscripts`),
  },
  {
    name: "JSON",
    description: "Read, build and change JSON values.",
    functions:
      words(`jsonb_extract_path jsonb_extract_path_text json_extract_path json_extract_path_text
    jsonb_array_length json_array_length jsonb_typeof json_typeof jsonb_build_object
    json_build_object jsonb_build_array json_build_array to_jsonb to_json row_to_json
    jsonb_array_elements jsonb_array_elements_text json_array_elements json_array_elements_text
    jsonb_each jsonb_each_text json_each json_each_text jsonb_object_keys json_object_keys
    jsonb_strip_nulls jsonb_pretty jsonb_path_exists jsonb_path_query jsonb_path_query_array
    jsonb_path_query_first jsonb_set jsonb_insert jsonb_concat jsonb_exists`),
  },
  {
    name: "Identifiers",
    description: "Make a new unique ID.",
    functions: words(`gen_random_uuid`),
  },
];

export const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set(
  FUNCTION_GROUPS.flatMap((group) => group.functions),
);

/** The types a value may be cast to. The object-identifier types, which read the catalog, are not among them. */
export const ALLOWED_TYPES: ReadonlySet<string> = new Set(
  words(`text varchar bpchar char name
    int2 int4 int8 smallint integer int bigint numeric decimal float4 float8 real
    bool boolean date time timetz timestamp timestamptz interval
    uuid json jsonb bytea`),
);
