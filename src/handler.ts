import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Database, EventEmitter, State } from "@arkecosystem/core-interfaces";
import {
    AlreadyVotedError,
    NoVoteError,
    TransactionError,
    UnvoteMismatchError,
    VotedForNonDelegateError,
    VotedForResignedDelegateError
} from "@arkecosystem/core-transactions/dist/errors";
import { TransactionHandler } from "@arkecosystem/core-transactions/dist/handlers";
import { VoteTransactionHandler } from "@arkecosystem/core-transactions/dist/handlers/vote";
import { TransactionReader } from "@arkecosystem/core-transactions/dist/transaction-reader";
import { Interfaces, Managers } from "@arkecosystem/crypto";

export class SwitchVoteDisabledError extends TransactionError {
    public constructor() {
        super("Failed to apply transaction, because switch-vote is disabled.");
    }
}

export class ExtendedVoteTransactionHandler extends VoteTransactionHandler {
    private milestoneHeight: number;

    public constructor(milestoneHeight: number) {
        super();
        this.milestoneHeight = milestoneHeight;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());

        while (reader.hasNext()) {
            const transactions = await reader.read();

            for (const transaction of transactions) {
                const wallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const votes = transaction.asset.votes;

                for (const vote of votes) {
                    const walletVoted: string | undefined = wallet.getAttribute("vote");

                    if (vote.startsWith("+")) {
                        if (walletVoted) {
                            throw new AlreadyVotedError();
                        }

                        wallet.setAttribute("vote", vote.slice(1));
                    } else {
                        if (!walletVoted) {
                            throw new NoVoteError();
                        } else if (walletVoted !== vote.slice(1)) {
                            throw new UnvoteMismatchError();
                        }

                        wallet.forgetAttribute("vote");
                    }
                }
            }
        }
    }

    public async throwIfCannotBeApplied(transaction: Interfaces.ITransaction, wallet: State.IWallet, walletManager: State.IWalletManager): Promise<void> {
        const { data }: Interfaces.ITransaction = transaction;

        if (data.asset.votes.length > 1) {
            const switchVoteEnabled: boolean = Managers.configManager.getMilestone().aip37 || (this.milestoneHeight && Managers.configManager.getHeight() >= this.milestoneHeight);
            if (!switchVoteEnabled) {
                throw new SwitchVoteDisabledError();
            }
        }

        const votes: string[] = data.asset.votes;
        let walletVote: string | undefined = wallet.getAttribute("vote");

        for (const vote of votes) {
            const delegatePublicKey: string = vote.slice(1);
            const delegateWallet: State.IWallet = walletManager.findByPublicKey(delegatePublicKey);

            if (vote.startsWith("+")) {
                if (walletVote) {
                    throw new AlreadyVotedError();
                }

                if (delegateWallet.hasAttribute("delegate.resigned")) {
                    throw new VotedForResignedDelegateError(vote);
                }

                walletVote = vote.slice(1);
            } else {
                if (!walletVote) {
                    throw new NoVoteError();
                } else if (walletVote !== vote.slice(1)) {
                    throw new UnvoteMismatchError();
                }

                walletVote = undefined;
            }

            if (!delegateWallet.isDelegate()) {
                throw new VotedForNonDelegateError(vote);
            }
        }

        return TransactionHandler.prototype.throwIfCannotBeApplied.call(this, transaction, wallet, walletManager);
    }

    public async applyToSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): Promise<void> {
        await TransactionHandler.prototype.applyToSender.call(this, transaction, walletManager);

        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const votes: string[] = transaction.data.asset.votes;

        for (const vote of votes) {
            if (vote.startsWith("+")) {
                sender.setAttribute("vote", vote.slice(1));
            } else {
                sender.forgetAttribute("vote");
            }
        }
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        const votes: string[] = transaction.data.asset.votes;

        for (const vote of votes) {
            emitter.emit(vote.startsWith("+") ? ApplicationEvents.WalletVote : ApplicationEvents.WalletUnvote, {
                delegate: vote,
                transaction: transaction.data
            });
        }
    }

    public async revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): Promise<void> {
        await TransactionHandler.prototype.revertForSender.call(this, transaction, walletManager);

        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const votes: string[] = transaction.data.asset.votes.reverse();

        for (const vote of votes) {
            if (vote.startsWith("+")) {
                sender.forgetAttribute("vote");
            } else {
                sender.setAttribute("vote", vote.slice(1));
            }
        }
    }
}