import { Utils } from "@arkecosystem/crypto";
import { peer } from "./proto/protos";

export const getPeers = {
    request: {
        serialize: (obj: peer.GetPeersRequest): Buffer => Buffer.from(peer.GetPeersRequest.encode(obj).finish()),
        deserialize: (payload: Buffer): {} => peer.GetPeersRequest.decode(payload)
    },
    response: {
        serialize: (peers): Buffer => {
            return Buffer.from(peer.GetPeersResponse.encode({ peers }).finish());
        },
        deserialize: (payload: Buffer) => {
            return peer.GetPeersResponse.decode(payload).peers;
        }
    }
};

export const getCommonBlocks = {
    request: {
        serialize: (obj: peer.IGetCommonBlocksRequest): Buffer => {
            return Buffer.from(peer.GetCommonBlocksRequest.encode(obj).finish());
        },
        deserialize: (payload: Buffer): peer.IGetCommonBlocksRequest => {
            return peer.GetCommonBlocksRequest.decode(payload);
        }
    },
    response: {
        serialize: (obj: peer.IGetCommonBlocksResponse): Buffer => {
            return Buffer.from(peer.GetCommonBlocksResponse.encode(obj).finish());
        },
        deserialize: (payload: Buffer): peer.IGetCommonBlocksResponse => {
            return peer.GetCommonBlocksResponse.decode(payload);
        }
    }
};

export const getStatus = {
    request: {
        serialize: (obj: peer.GetStatusRequest): Buffer => Buffer.from(peer.GetStatusRequest.encode(obj).finish()),
        deserialize: (payload: Buffer): {} => peer.GetStatusRequest.decode(payload)
    },
    response: {
        serialize: (obj): Buffer => {
            obj.state.header.totalAmount = obj.state.header.totalAmount.toString();
            obj.state.header.totalFee = obj.state.header.totalFee.toString();
            obj.state.header.reward = obj.state.header.reward.toString();
            return Buffer.from(peer.GetStatusResponse.encode(obj).finish());
        },
        deserialize: (payload: Buffer) => {
            const decoded = peer.GetStatusResponse.decode(payload);
            const totalAmount = new Utils.BigNumber(decoded.state!.header!.totalAmount!);
            const totalFee = new Utils.BigNumber(decoded.state!.header!.totalFee!);
            const reward = new Utils.BigNumber(decoded.state!.header!.reward!);

            return {
                ...decoded,
                state: {
                    ...decoded.state,
                    header: {
                        ...decoded.state?.header,
                        totalAmount,
                        totalFee,
                        reward
                    }
                }
            };
        }
    }
};
