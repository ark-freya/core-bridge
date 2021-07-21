import { defaults } from "./defaults";
import { Container } from "@arkecosystem/core-interfaces";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    alias: "core-bridge-2.7",
    defaults,
    async register(container: Container.IContainer, options): Promise<void> {
        if (!options.enabled) {
            return;
        }
    }
};
