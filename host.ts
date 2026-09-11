import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./contract.js";
import { loadCatalog, readSkill, recordSkill } from "./source.js";

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    record: (input, context) => recordSkill(input, context.signal),
    catalog: (input, context) => loadCatalog(input, context.signal),
    read: (input) => readSkill(input),
  },
});
