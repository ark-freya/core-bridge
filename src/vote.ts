import { app } from "@arkecosystem/core-container";
import { Database, State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Enums, Interfaces, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import { TransactionHandler } from "@arkecosystem/core-transactions/dist/handlers";
import { validator } from "@arkecosystem/crypto/dist/validation";
import { schemas } from "@arkecosystem/crypto/dist/transactions/types";

import { ExtendedVoteTransactionHandler } from "./handler";

export class Vote {
    static register(options): void {
        Vote.extendSchema(options.aip37);
        Vote.extendHandler();
        Vote.extendWalletManager();
    }

    private static extendHandler(): void {
        const service: TransactionHandler = new ExtendedVoteTransactionHandler();
        const { typeGroup, type } = service.getConstructor();

        const internalType: Transactions.InternalTransactionType = Transactions.InternalTransactionType.from(type, typeGroup);
        (Handlers.Registry as any).registeredTransactionHandlers.set(internalType, service);
    }

    private static extendSchema(milestoneHeight: number): void {
        const ajv = validator.getInstance();

        ajv.addKeyword("aip37", {
            validate: (schema, data) => {
                const active = schema && (Managers.configManager.getMilestone().aip37 || (milestoneHeight && Managers.configManager.getHeight() >= milestoneHeight));
                return (active && data.length <= 2) || data.length === 1;
            }
        });

        validator.extendTransaction(schemas.vote, true);
        validator.extendTransaction(schemas.extend(schemas.vote, { properties: { asset: { properties: { votes: { maxItems: 2, aip37: true } } } } }));
    }

    private static async extendWalletManager(): Promise<void> {
        const database: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");

        (database.walletManager as any).updateVoteBalances = function (
            sender: State.IWallet,
            recipient: State.IWallet,
            transaction: Interfaces.ITransactionData,
            lockWallet: State.IWallet,
            lockTransaction: Interfaces.ITransactionData,
            revert: boolean = false
        ): void {
            if (transaction.type === Enums.TransactionType.Vote && transaction.typeGroup === Enums.TransactionTypeGroup.Core) {
                const senderDelegatedAmount = sender
                    .getAttribute("htlc.lockedBalance", Utils.BigNumber.ZERO)
                    .plus(sender.balance)
                    .minus(revert ? transaction.fee : Utils.BigNumber.ZERO);
                for (let i = 0; i < transaction.asset.votes.length; i++) {
                    const vote: string = transaction.asset.votes[i];
                    const delegate: State.IWallet = this.findByPublicKey(vote.substr(1));

                    const senderVoteDelegatedAmount = i === 0 && vote.startsWith("-") ? senderDelegatedAmount.plus(transaction.fee) : senderDelegatedAmount;
                    const voteBalanceChange: Utils.BigNumber = senderVoteDelegatedAmount.times(vote.startsWith("-") ? -1 : 1).times(revert ? -1 : 1);
                    const voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO).plus(voteBalanceChange);

                    delegate.setAttribute("delegate.voteBalance", voteBalance);
                }
            } else {
                if (sender.hasVoted()) {
                    const delegate: State.IWallet = this.findByPublicKey(sender.getAttribute("vote"));

                    let amount = transaction.amount;
                    if (transaction.type === Enums.TransactionType.MultiPayment && transaction.typeGroup === Enums.TransactionTypeGroup.Core) {
                        amount = transaction.asset.payments.reduce((prev, curr) => prev.plus(curr.amount), Utils.BigNumber.ZERO);
                    }

                    const total: Utils.BigNumber = amount.plus(transaction.fee);

                    const voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);
                    let newVoteBalance: Utils.BigNumber;

                    if (transaction.type === Enums.TransactionType.HtlcLock && transaction.typeGroup === Enums.TransactionTypeGroup.Core) {
                        newVoteBalance = revert ? voteBalance.plus(transaction.fee) : voteBalance.minus(transaction.fee);
                    } else if (transaction.type === Enums.TransactionType.HtlcClaim && transaction.typeGroup === Enums.TransactionTypeGroup.Core) {
                        newVoteBalance = revert ? voteBalance.plus(transaction.fee).minus(lockTransaction.amount) : voteBalance.minus(transaction.fee).plus(lockTransaction.amount);
                    } else {
                        newVoteBalance = revert ? voteBalance.plus(total) : voteBalance.minus(total);
                    }

                    delegate.setAttribute("delegate.voteBalance", newVoteBalance);
                }

                if (transaction.type === Enums.TransactionType.HtlcClaim && transaction.typeGroup === Enums.TransactionTypeGroup.Core && lockWallet.hasAttribute("vote")) {
                    const lockWalletDelegate: State.IWallet = this.findByPublicKey(lockWallet.getAttribute("vote"));
                    const lockWalletDelegateVoteBalance: Utils.BigNumber = lockWalletDelegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);

                    lockWalletDelegate.setAttribute(
                        "delegate.voteBalance",
                        revert ? lockWalletDelegateVoteBalance.plus(lockTransaction.amount) : lockWalletDelegateVoteBalance.minus(lockTransaction.amount)
                    );
                }

                if (transaction.type === Enums.TransactionType.MultiPayment && transaction.typeGroup === Enums.TransactionTypeGroup.Core) {
                    for (const { recipientId, amount } of transaction.asset.payments) {
                        const recipientWallet: State.IWallet = this.findByAddress(recipientId);
                        if (recipientWallet.hasVoted()) {
                            const vote = recipientWallet.getAttribute("vote");
                            const delegate: State.IWallet = this.findByPublicKey(vote);
                            const voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);

                            delegate.setAttribute("delegate.voteBalance", revert ? voteBalance.minus(amount) : voteBalance.plus(amount));
                        }
                    }
                }

                if (recipient && recipient.hasVoted() && (transaction.type !== Enums.TransactionType.HtlcLock || transaction.typeGroup !== Enums.TransactionTypeGroup.Core)) {
                    const delegate: State.IWallet = this.findByPublicKey(recipient.getAttribute("vote"));
                    const voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);

                    delegate.setAttribute("delegate.voteBalance", revert ? voteBalance.minus(transaction.amount) : voteBalance.plus(transaction.amount));
                }
            }
        };
    }
}
