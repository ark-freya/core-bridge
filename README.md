## Core Bridge

<p align="center">
    <img src="https://raw.githubusercontent.com/alessiodf/core-bridge/main/banner.png" />
</p>

## Introduction

**Core Bridge** is a translation layer to enable ARK Core 2.7 to communicate with ARK Core 3.0 nodes and vice versa.

**It eliminates the hard fork when migrating an ARK Core 2.7 network to ARK Core 3.0** as delegates can still forge on their backup ARK Core 2.7 nodes while their main nodes migrate to ARK Core 3.0, preventing any network downtime and missed blocks. It also adds support in ARK Core 2.7 for the new switch vote logic so it can handle payloads containing an unvote and vote in a single transaction, which is necessary to maintain sync with a live ARK Core 3.0 network.

**It allows legacy ARK Core 2.x plugins and API services to continue working on ARK Core 3.0 networks** until they are properly ported since they can continue operating on ARK Core 2.7 nodes.

**It permits new ARK Core 3.0 plugins and API services to run on existing ARK Core 2.7 networks** so developers can get a head start testing and releasing their new plugins for real live networks immediately.

**It gives node operators freedom** to upgrade to ARK Core 3.0 either before or after the migration deadline as both ARK Core versions will be able to communicate with each other. This means delegates and relay operators can prepare in advance or defer the upgrade until a more convenient time.

**Core Bridge** is available as two separate plugins, so there is one version for ARK Core 2.7 and a separate version for ARK Core 3.0; install the version that matches the version of ARK Core you are running.

**[If you use this plugin or think it is useful, please leave us a review on MarketSquare.io.](https://marketsquare.io/projects/core-bridge)**

## Automatic Installation

There is a script available to automatically download, install and configure the correct **Core Bridge** depending on the version of ARK Core that you are running. You may execute the following command to download the automatic installation script:

```
curl -o install https://raw.githubusercontent.com/alessiodf/core-bridge/main/install
```

If you have installed Core using the default installation script provided by ARK Ecosystem, or your installation of Core is located in a folder within the home directory, execute the script with `node install` and it should automatically find it. If you have installed Core in another location outside of the home directory, or the script cannot find your installation, you may add the path to end of the script command. For example, if Core is installed in `/opt/ark-core`, run `node install /opt/ark-core`.

In the case of ARK Core 2.7, you may be prompted to enter the height when switch votes are to be activated. The script will attempt to automatically detect the correct value without user intervention if details have been provided by the administrators or developers of the relevant network in our [**aip37-milestones**](https://github.com/alessiodf/core-bridge/tree/aip37-milestones) branch. However, if you are prompted to supply this value, you should endeavour to enter the correct height so that your node knows when to accept switch votes, otherwise your node will fork if it forges or accepts a block containing a switch vote prematurely as the rest of the network will reject the block, and similarly it will fork if it does not accept a block containing a switch vote when the rest of the network does. If you do not know the value, or it is not yet known for your network, you may leave it blank - which leaves switch votes disabled - and then re-run the installation script again in future to set it to the correct height when it is known.

Once the plugin is installed, you may be prompted to restart the relevant processes. After restarting, you should see one or more entries in your logs to confirm that the plugin has been loaded. You should then be able to communicate with nodes running either Core 2.7 or Core 3.0.

## Manual Installation

Install the correct version of the plugin depending on whether you are using Core 2.7 or Core 3.0. The command to use depends on whether you have installed Core globally, i.e. by using the default installation script provided by ARK Ecosystem, or in another folder.

If Core has been installed globally, execute `yarn global add @alessiodf/core-bridge-X.X`. Otherwise, enter the directory where Core has been installed and run `yarn add -W @alessiodf/core-bridge-X.X`. Replace `X.X` with either `2.7` if you are running Core 2.7, or `3.0` if you are running Core 3.0.

### Core 2.7

Once the plugin is installed, we must enable it by modifying `plugins.js`. This file is found in `~/.config/ark-core/{mainnet|devnet|testnet|unitnet}/plugins.js` depending on network.

Add a new section to the `module.exports` block. **It is really important that it comes immediately before core-blockchain.** An example configuration is below:

```
...
"@alessiodf/core-bridge-2.7": { aip37: 10000000 },
"@arkecosystem/core-blockchain": {},
...
```

The value of `aip37` should be set to the milestone height where switch vote transactions are enabled on the network. If this height is not known, set it to be `undefined` but remember to edit it to the correct height and restart Core once you know it. Failure to do so prior to the activation of switch votes will result in your node forking when the rest of the network starts to accept switch votes. Similarly, entering the wrong value so that your node accepts them before the rest of the network will also result in forking.

Next, edit `app.js` in the same folder as `plugins.js`. If you do not have `app.js`, copy it from the `node_modules/@arkecosystem/core/bin/config/{mainnet|devnet|testnet|unitnet}` folder. **Ensure every entry contains `'@alessiodf/core-bridge-2.7'` inside each `include` array.** An example configuration is below:

```
module.exports = {
  cli: {
    core: {
      run: {
        plugins: {
          include: [
            '@arkecosystem/core-magistrate-transactions',
            '@alessiodf/core-bridge-2.7'
          ]
        }
      }
    },
    relay: {
      run: {
        plugins: {
          include: [
            '@arkecosystem/core-magistrate-transactions',
            '@alessiodf/core-bridge-2.7'
          ]
        }
      }
    },
    forger: {
      run: {
        plugins: {
          include: [
            '@arkecosystem/core-magistrate-transactions',
            '@alessiodf/core-bridge-2.7'
          ]
        }
      }
    },
    chain: {
      run: {
        plugins: {
          include: [
            '@arkecosystem/core-magistrate-transactions',
            '@alessiodf/core-bridge-2.7'
          ]
        }
      }
    },
    snapshot: {
      run: {
        plugins: {
          include: [
            '@arkecosystem/core-magistrate-transactions',
            '@alessiodf/core-bridge-2.7'
          ]
        }
      }
    }
  }
}
```

When finished, you must restart your Core/Forger/Relay processes and then you should see one or more entries in your logs to confirm that the plugin has been loaded. You should then be able to communicate with nodes running either Core 2.7 or Core 3.0.

### Core 3.0

Once the plugin is installed, we must enable it by modifying `app.json`. This file is found in `~/.config/ark-core/{mainnet|devnet|testnet|unitnet}/app.json` depending on network.

Add a new section within the `core.plugins` and `relay.plugins` blocks. **It is really important that it comes immediately before core-blockchain.** An example configuration is below:

```
...
{
    "package": "@alessiodf/core-bridge-3.0"
},
{
    "package": "@arkecosystem/core-blockchain"
},
...
```

When finished, you must restart your Core/Relay processes and then you should see one or more entries in your logs to confirm that the plugin has been loaded. You should then be able to communicate with nodes running either Core 2.7 or Core 3.0.

## Source Code

The source code is available inside the [**core-bridge-2.7**](https://github.com/alessiodf/core-bridge/tree/core-bridge-2.7) and [**core-bridge-3.0**](https://github.com/alessiodf/core-bridge/tree/core-bridge-3.0) branches of this repository.
 
## Credits

-   [All Contributors](../../contributors)
-   [alessiodf](https://github.com/alessiodf)
-   [Cactus-15-49](https://github.com/Cactus-15-49)

## License

[GPLv3](LICENSE) © [alessiodf](https://github.com/alessiodf) & [Cactus-15-49](https://github.com/Cactus-15-49)
