import { app } from "@arkecosystem/core-container";
import { Container, Database } from "@arkecosystem/core-interfaces";
import { Managers } from "@arkecosystem/crypto";
import { lt } from "semver";

import { defaults } from "./defaults";
import { P2P } from "./p2p";
import { Vote } from "./vote";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    alias: "core-bridge-2.7",
    defaults,
    async register(container: Container.IContainer, options): Promise<void> {
        if (!options || !options.enabled) {
            return;
        }

        const logger = app.resolvePlugin("logger");

        if (lt(app.getVersion(), "2.7.0")) {
            logger.info("This version of Core Bridge requires Core 2.7");
            return;
        }

        const p2p: P2P = new P2P();
        p2p.register(options);

        logger.info("Loaded Core Bridge");
        logger.info(`Core ${app.getVersion()} can now communicate with Core 3.0`);

        const aip37 = Math.min(
            Managers.configManager
                .getMilestones()
                .filter((milestone) => milestone.aip37)
                .map((milestone) => milestone.height)[0] || Infinity,
            Math.trunc(+options.aip37) || Infinity
        );

        const switchVote: Vote = new Vote();
        switchVote.register(options);

        if (aip37 !== Infinity) {
            const currentHeight = (await app.resolvePlugin<Database.IDatabaseService>("database").getLastBlock()).data.height;
            if (aip37 > currentHeight) {
                logger.debug(`AIP37 will activate after height ${aip37.toLocaleString()}`);
            }
        } else {
            logger.warn("No milestone configured to enable AIP37");
            logger.warn("This is probably wrong and we will fork in future");
            logger.warn("Configure the milestone height in plugins.js or add it to milestones.json");
        }
    }
};
