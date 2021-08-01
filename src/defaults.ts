import { Managers } from "@arkecosystem/crypto";

export const defaults = {
    enabled: true,
    hidePrerelease: Managers.configManager.get("network.name") === "mainnet",
    server: {
        http: {
            host: process.env.CORE_P2P_HOST || "0.0.0.0",
            port: process.env.CORE_P2P_PORT || 4002
        }
    }
};
