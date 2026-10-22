// The venue port. The read model (Market, Book, Prov, FeeSpec, the adapter interface and the injected fetch) is
// defined once in the shared SDK (sdk/model.ts, docs/sdk-and-api-design.md step 3); this file re-exports it so
// app imports keep working.

export type * from "@sdk/model";
