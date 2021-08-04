import { Container, Contracts, Providers, Utils } from "@arkecosystem/core-kernel";
import { Interfaces } from "@arkecosystem/crypto";
import { parse } from "semver";

import { Client } from "./client";
import { Server } from "./server";

@Container.injectable()
export class P2P {
    @Container.inject(Container.Identifiers.Application)
    private readonly app!: Contracts.Kernel.Application;

    @Container.inject(Container.Identifiers.PluginConfiguration)
    @Container.tagged("plugin", "@alessiodf/core-bridge-3.0")
    private readonly configuration!: Providers.PluginConfiguration;

    @Container.inject(Container.Identifiers.PeerNetworkMonitor)
    private readonly monitor!: Contracts.P2P.NetworkMonitor;

    public boot(): void {
        let realVersion: string = this.app.version();
        const parsedVersion = parse(realVersion);
        let version: string = realVersion.replace(`${parsedVersion!.major}.${parsedVersion!.minor}.`, `2.${parsedVersion!.major}${parsedVersion!.minor}.`);

        const hidePrerelease: boolean = this.configuration.get("hidePrerelease") as boolean;

        const realVersionNonPrerelease = realVersion.replace(/-(.*)/, "");
        const isPrerelease = realVersion !== realVersionNonPrerelease;

        if (hidePrerelease) {
            version = version.replace(/-(.*)/, "");
            realVersion = realVersionNonPrerelease;
        }

        const client = this.app.get<Client>(Symbol.for("Bridge<Client>"));
        client.extend(realVersion, hidePrerelease, isPrerelease);

        const server = this.app.get<Server>(Symbol.for("Bridge<Server>"));
        server.extend(version, realVersion, hidePrerelease, isPrerelease);

        if (this.monitor) {
            (this.monitor as any).broadcastBlock = async function (block: Interfaces.IBlock): Promise<void> {
                const peers: Contracts.P2P.Peer[] = this.repository.getPeers();
                this.logger.info(`Broadcasting block ${block.data.height.toLocaleString()} to ${Utils.pluralize("peer", peers.length, true)}`);
                await Promise.all(peers.map((peer) => this.communicator.postBlock(peer, block)));
            };
        }
    }
}
