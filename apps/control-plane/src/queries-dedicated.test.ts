// The query suite again, with the tenant's tables in a database of their own.
process.env.VX_DATA_MODE = "dedicated";
await import("./queries.test.js");
