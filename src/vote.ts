import { app } from "@arkecosystem/core-container";
import { Container, Database, State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { TransactionHandler } from "@arkecosystem/core-transactions/dist/handlers";
import { Enums, Interfaces, Transactions, Utils } from "@arkecosystem/crypto";
import { schemas } from "@arkecosystem/crypto/dist/transactions/types";
import { validator } from "@arkecosystem/crypto/dist/validation";

import { ExtendedVoteTransactionHandler } from "./handler";

export class Vote {
    public register(options: Container.IPluginOptions): void {
        this.extendSchema();
        this.extendHandler(Number(options.aip37));
        this.extendWalletManager();
    }

    private extendHandler(milestoneHeight: number): void {
        const service: TransactionHandler = new ExtendedVoteTransactionHandler(milestoneHeight);
        const { typeGroup, type } = service.getConstructor();

        const internalType: Transactions.InternalTransactionType = Transactions.InternalTransactionType.from(type, typeGroup);
        (Handlers.Registry as any).registeredTransactionHandlers.set(internalType, service);
    }

    private extendSchema(): void {
        validator.extendTransaction(schemas.vote, true);
        validator.extendTransaction(schemas.extend(schemas.vote, { properties: { asset: { properties: { votes: { maxItems: 2 } } } } }));
    }

    private async extendWalletManager(): Promise<void> {
        const database: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");

        if (database) {
            (database.walletManager as any)._updateVoteBalances = (database.walletManager as any).updateVoteBalances;
            (database.walletManager as any).updateVoteBalances = function (
                sender: State.IWallet,
                recipient: State.IWallet,
                transaction: Interfaces.ITransactionData,
                lockWallet: State.IWallet,
                lockTransaction: Interfaces.ITransactionData,
                revert: boolean = false
            ): void {
                if (transaction.type === Enums.TransactionType.Vote && transaction.typeGroup === Enums.TransactionTypeGroup.Core) {
                    const firstVote: string = transaction.asset.votes[0];
                    const firstDelegate: State.IWallet = this.findByPublicKey(firstVote.substr(1));
                    const firstVoteBalance: Utils.BigNumber = firstDelegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);

                    this._updateVoteBalances(sender, recipient, transaction, lockWallet, lockTransaction, revert);

                    const firstVoteBalanceAfterUpdate: Utils.BigNumber = firstDelegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);
                    firstDelegate.setAttribute("delegate.voteBalance", firstVoteBalance);

                    const senderDelegatedAmount = sender
                        .getAttribute("htlc.lockedBalance", Utils.BigNumber.ZERO)
                        .plus(sender.balance)
                        .minus(revert ? transaction.fee : Utils.BigNumber.ZERO);

                    let firstVoteDifference: Utils.BigNumber;

                    for (let i = 0; i < transaction.asset.votes.length; i++) {
                        const vote: string = transaction.asset.votes[i];
                        const delegate: State.IWallet = this.findByPublicKey(vote.substr(1));

                        const senderVoteDelegatedAmount = i === 0 && vote.startsWith("-") ? senderDelegatedAmount.plus(transaction.fee) : senderDelegatedAmount;
                        const voteBalanceChange: Utils.BigNumber = senderVoteDelegatedAmount.times(vote.startsWith("-") ? -1 : 1).times(revert ? -1 : 1);
                        let voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO).plus(voteBalanceChange);

                        if (i === 0) {
                            firstVoteDifference = voteBalance.minus(firstVoteBalanceAfterUpdate);
                            voteBalance = voteBalance.minus(firstVoteDifference);
                        } else {
                            voteBalance = voteBalance.plus(firstVoteDifference);
                        }

                        delegate.setAttribute("delegate.voteBalance", voteBalance);
                    }
                } else {
                    this._updateVoteBalances(sender, recipient, transaction, lockWallet, lockTransaction, revert);
                }
            };
        }
    }
}
