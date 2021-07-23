import { app } from "@arkecosystem/core-container";
import { defaults } from "./defaults";
import { Container } from "@arkecosystem/core-interfaces";

import { P2P } from "./p2p";
import { Vote } from "./vote";

import { lt } from "semver";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    alias: "core-bridge-2.7",
    defaults,
    async register(container: Container.IContainer, options): Promise<void> {
        if (!options.enabled) {
            return;
        }

        const logger = app.resolvePlugin("logger");

        if (lt(app.getVersion(), "2.7.0")) {
            logger.info("This version of Core Bridge requires Core 2.7");
            return;
        }

        P2P.register();
        Vote.register();

        logger.info("Loaded Core Bridge");
        logger.info(`Core ${app.getVersion()} can now communicate with Core 3.0`);
    }
};
