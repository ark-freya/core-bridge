import { Container, Contracts, Providers } from "@arkecosystem/core-kernel";

export class ServiceProvider extends Providers.ServiceProvider {
    public async register(): Promise<void> {
        //
    }

    public async boot(): Promise<void> {
        const logger = this.app.get<Contracts.Kernel.Logger>(Container.Identifiers.LogService);

        logger.info("Loaded Core Bridge");
    }

    public async bootWhen(): Promise<boolean> {
        return !!this.config().get("enabled");
    }
}
