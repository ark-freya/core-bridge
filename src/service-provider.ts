import { Container, Contracts, Providers } from "@arkecosystem/core-kernel";

import { Client } from "./client";
import { P2P } from "./p2p";
import { Server } from "./server";

export class ServiceProvider extends Providers.ServiceProvider {
    private p2p = Symbol.for("Bridge<P2P>");

    private client = Symbol.for("Bridge<Client>");
    private server = Symbol.for("Bridge<Server>");

    public async register(): Promise<void> {
        this.app.bind(this.p2p).to(P2P).inSingletonScope();

        this.app.bind(this.client).to(Client).inSingletonScope();
        this.app.bind(this.server).to(Server).inSingletonScope();
    }

    public async boot(): Promise<void> {
        const logger = this.app.get<Contracts.Kernel.Logger>(Container.Identifiers.LogService);

        this.app.get<P2P>(this.p2p).boot();
        logger.info("Loaded Core Bridge");
        logger.info(`Core ${this.app.version()} can now communicate with Core 2.7`);
    }

    public async bootWhen(): Promise<boolean> {
        return !!this.config().get("enabled");
    }
}
