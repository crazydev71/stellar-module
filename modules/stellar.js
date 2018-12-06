'use strict';
const fs = require('fs');
const path = require('path');
const StellarSdk = require('stellar-sdk');

StellarSdk.Network.useTestNetwork();
const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');

const sourceAccountId = 'GC6HZUDCZYMQXPRAOSHB73OF4MRUJHTMDXIUX3TSXZOPKT5ULAFFLZHQ';
const sourceAccountKey = 'SCU5BIWLDDCJVIVNHNSNBEJUBTT3NVDPZH4F4ETSKSJFSOLKSEZ3SSJK';

const secondaryAccountId = 'GDVRGQNCIFALXKLPVPFMD3MYYGVFAKXBHSAGOFCQBXTX5YXX7FZGNJO3';
const secondaryAccountKey = 'SBTGON6HN6FELJHMENPVMFA7XTUEB2QEMIA6GAFJASXPADCX7OBFZRAL';

const cursorPath = path.join(path.resolve(__dirname), '../data/cursor.txt');
const depositsPath = path.join(path.resolve(__dirname), '../data/deposits.txt');


class StellarService {
  constructor (server, sourceAccountKey, secondaryAccountKey) {
    this.server = server;
    this.sourceAccountKey = sourceAccountKey;
    this.sourceKeys = StellarSdk.Keypair.fromSecret(sourceAccountKey);
    this.secondaryAccountKey = secondaryAccountKey;
    this.secondaryKeys = StellarSdk.Keypair.fromSecret(secondaryAccountKey);
    this.serviceTimer = null;

    this.cursor = this.readJSONData(cursorPath).cursor;
    this.deposits = this.readJSONData(depositsPath);
  }

  getDepositAddress () {
    return {
      address: this.sourceKeys.publicKey(),
      memoType: 'id',
      memo: Math.floor(Math.random() * Date.now()) // unique user id
    };
  };

  getDepositAmount (userId) {
    const deposits = this.readJSONData(depositsPath);
    return deposits[userId] || 0;
  }

  async watchPayments (accountId) {
    try {
      // Get new payments
      const payments = await this.server.payments()
        .forAccount(accountId)
        .cursor(this.cursor)
        .call();
      const { records } = payments;

      if (records.length > 0) {
        // Save cursor
        this.cursor = records[records.length - 1].paging_token;
        this.writeJSONData(cursorPath, { cursor: this.cursor });
      }

      this.checkPayments(records);
    } catch (error) {
      console.log(error);
    }
  }

  async checkPayments (newRecords) {
    for (let i = 0; i < newRecords.length; i++) {
      const record = newRecords[i];
      if (record.type === 'payment' && record.to === this.sourceKeys.publicKey()) {
        // Get transaction by transaction_hash to check memo
        try {
          const tx = await this.server.transactions()
            .transaction(record.transaction_hash)
            .call();
          if (tx.memo_type === 'id' && !!tx.memo) {
            // Increase user deposit amount and save
            this.deposits[tx.memo] = (this.deposits[tx.memo] || 0) + Number(record.amount);
            this.writeJSONData(depositsPath, this.deposits);
            console.log('-------Proccessed new deposit from: ', tx.memo);
            console.log('-------Deposit amount: ', record.amount);
          }
        } catch (error) {
          console.log(error);
        }
      }
    }
  }

  start () {
    try {
      // Stop if service was running
      this.stop();

      // Start watching
      const sourceAccountId = this.sourceKeys.publicKey();
      this.watchPayments(sourceAccountId);
      setInterval(() => { this.watchPayments(sourceAccountId); }, 1000 * 10);

    } catch (error) {
      console.log(error);
    }
  }

  stop () {
    if (this.serviceTimer) {
      clearInterval(this.serviceTimer);
    }
  }

  readJSONData (path) {
    try {
      const buf = fs.readFileSync(path, 'utf8');
      if (!buf || !buf.length) {
        return {};
      }
      return JSON.parse(buf);
    } catch (error) {
      console.log(error);
    }
    return {};
  }

  writeJSONData (path, obj) {
    try {
      const buf = JSON.stringify(obj || {}, null, '\t');
      fs.writeFileSync(path, buf);
      return true;
    } catch (error) {
      console.log(error);
    }

    return false;
  }

  async setMultiSig () {
    const account = await server.loadAccount(this.sourceKeys.publicKey());
    const transaction = new StellarSdk.TransactionBuilder(account)
      .addOperation(StellarSdk.Operation.setOptions({
        signer: {
          ed25519PublicKey: this.secondaryKeys.publicKey(),
          weight: 1
        }
      }))
      .addOperation(StellarSdk.Operation.setOptions({
        masterWeight: 1,
        lowThreshold: 1,
        medThreshold: 2,
        highThreshold: 2
      }))
      .build();
    transaction.sign(this.sourceKeys);

    const result = await server.submitTransaction(transaction);
    return result;
  }

  async Withdraw (withdrawAccountId, amount) {
    const account = await server.loadAccount(this.sourceKeys.publicKey());
    const transaction = new StellarSdk.TransactionBuilder(account)
      .addOperation(StellarSdk.Operation.payment({
          destination: withdrawAccountId,
          asset: StellarSdk.Asset.native(),
          amount: amount.toString(),
      }))
      .build();

    transaction.sign(this.sourceKeys);
    transaction.sign(this.secondaryKeys);
    
    const result = await server.submitTransaction(transaction);
    return result;
  }
}

const stellarService = new StellarService(server, sourceAccountKey, secondaryAccountKey);

module.exports = {
  server,
  sourceAccountId,
  secondaryAccountId,
  stellarService,
};
