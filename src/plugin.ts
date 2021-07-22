import { app } from "@arkecosystem/core-container";
import { defaults } from "./defaults";
import { Container } from "@arkecosystem/core-interfaces";

import { P2P } from "./p2p";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    alias: "core-bridge-2.7",
    defaults,
    async register(container: Container.IContainer, options): Promise<void> {
        if (!options.enabled) {
            return;
        }

        const logger = app.resolvePlugin("logger");

        P2P.register();

        logger.info("Loaded Core Bridge");
        logger.info(`Core ${app.getVersion()} can now communicate with Core 3.0`);
    }
};
