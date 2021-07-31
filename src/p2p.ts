import { app } from "@arkecosystem/core-container";
import { Container } from "@arkecosystem/core-interfaces";
import { parse } from "semver";

import { Client } from "./client";
import { Server } from "./server";

export class P2P {
    public register(options: Container.IPluginOptions): void {
        let version: string = app.getVersion();
        const parsedVersion = parse(version);

        const versionNonPrerelease: string = version.replace(/-(.*)/, "");
        const isPrerelease: boolean = version !== versionNonPrerelease;

        version = version.replace(`${parsedVersion.major}.${parsedVersion.minor}.`, `3.${parsedVersion.major}${parsedVersion.minor}.`);

        if (options.hidePrerelease) {
            version = versionNonPrerelease;
        }

        const client: Client = new Client();
        const server: Server = new Server();
        client.extend(version, !!options.hidePrerelease, isPrerelease);
        server.extend(version, !!options.hidePrerelease, isPrerelease);
    }
}
