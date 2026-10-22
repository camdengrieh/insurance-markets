// The shape of the bundled `links.json` (docs/dapp-design.md 4.5 "Linked groups", research 26 section 9.1).
//
// One contract with the linker's export: the schemas live in the SDK (sdk/links/dataset.ts), which the export step
// also checks every link against, and are re-exported here under the page's names. Rule R2: the dataset holds ids,
// hashes, close times, outcome maps, proof and state, and NO third-party price, title or rules text; the schemas are
// strict, so a title, a price or any extra text in the file makes the whole dataset invalid instead of being quietly
// shown. A dataset is also pinned by a content hash (see dataset.ts); a file without one is refused.

export {
  DATASET_BANDS as LINK_BANDS,
  DATASET_BASIS_AXES as BASIS_AXES,
  DATASET_BASIS_CLASSES as BASIS_CLASSES,
  DATASET_PROOFS as LINK_PROOFS,
  DATASET_RELATIONS as LINK_RELATIONS,
  DATASET_STATES as LINK_STATES,
  MAX_DATASET_LINKS as MAX_LINKS,
  datasetLegSchema as linkLegSchema,
  datasetLinkSchema as linkSchema,
  linkDatasetSchema,
  type DatasetBand as LinkBand,
  type DatasetLeg as LinkLeg,
  type DatasetLink as Link,
  type DatasetProof as LinkProof,
  type DatasetRelation as LinkRelation,
  type DatasetState as LinkState,
  type LinkDataset,
} from "@sdk/links/dataset";
