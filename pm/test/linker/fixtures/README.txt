app-dataset.sample.json: the dApp dataset (app/src/features/signals/links/schema.ts) that pm/linker/main.ts
export-app writes, built from a SYNTHETIC sample (pm/test/linker/app-dataset.test.ts: hashed ids, invented
titles and rules that never reach the file). It is not a capture and names no real market. Regenerate with
write-sample.ts; pm/test/linker/app-dataset.test.ts checks the bytes and the app's
candidates.test.ts loads it.
