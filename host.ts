import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./contract.js";
import { loadCatalog, readSkill } from "./source.js";

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    catalog: (input, context) => loadCatalog(input, context.signal),
    read: (input) => readSkill(input),
  },
});
