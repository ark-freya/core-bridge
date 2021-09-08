import { app } from "@arkecosystem/core-container";
import { Blockchain, Container, P2P as CoreP2P } from "@arkecosystem/core-interfaces";
import { Interfaces } from "@arkecosystem/crypto";
import pluralize from "pluralize";
import { parse } from "semver";

import { Client } from "./client";
import { Server } from "./server";

export class P2P {
    public register(options: Container.IPluginOptions): void {
        let version: string = app.getVersion();
        const parsedVersion = parse(version);

        version = version.replace(`${parsedVersion.major}.${parsedVersion.minor}.`, `3.${parsedVersion.major}${parsedVersion.minor}.`);
        const versionNonPrerelease: string = version.replace(/-(.*)/, "");
        const isPrerelease: boolean = version !== versionNonPrerelease;

        if (options.hidePrerelease) {
            version = versionNonPrerelease;
        }

        const client: Client = new Client();
        const server: Server = new Server();
        client.extend(version, !!options.hidePrerelease, isPrerelease);
        server.extend(version, !!options.hidePrerelease, isPrerelease);

        const monitor = app.resolvePlugin<CoreP2P.IPeerService>("p2p").getMonitor();
        monitor.broadcastBlock = async function (block: Interfaces.IBlock): Promise<void> {
            const blockchain = app.resolvePlugin<Blockchain.IBlockchain>("blockchain");

            if (!blockchain) {
                this.logger.info(`Skipping broadcast of block ${block.data.height.toLocaleString()} as blockchain is not ready`);
                return;
            }

            const peers: CoreP2P.IPeer[] = this.storage.getPeers();
            this.logger.info(`Broadcasting block ${block.data.height.toLocaleString()} to ${pluralize("peer", peers.length, true)}`);
            await Promise.all(peers.map((peer) => this.communicator.postBlock(peer, block)));
        };
    }
}
