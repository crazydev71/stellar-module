const assert = require('assert');
const StellarSdk = require('stellar-sdk');
const { server, stellarService, sourceAccountId } = require('../modules/stellar');

const testPubKey = 'GAKDEE4NRZ6SO4SLG7QPCKMWT5UAG5GDXJ323CQES64OUL4GGW3A4A3T';
const testPriKey = 'SB6ELYEXDIQP3HEP5ILCFTGKJUHWVJSCGGTGXOOPGUAYBYFWNDBNTP7U';
const testKeyPair = StellarSdk.Keypair.fromSecret(testPriKey);

const sleep = (sec) => {
  return new Promise(resolve => {
    setTimeout(() => resolve(), 1000 * sec);
  });
};

describe('Stellar module', () => {

  describe('Deposite', function() {
    this.timeout(1000 * 20);
    const depositAddress = stellarService.getDepositAddress();

    it('Deposit address should be the same with sourceAccountId.', () => {
      assert.equal(depositAddress.address, sourceAccountId);
    });
    it('Memo type should be "id".', () => {
      assert.equal(depositAddress.memoType, 'id');
    });
    it('Memo should be a number', () => {
      assert.equal(typeof depositAddress.memo, 'number');
    });

    it('Deposit amount and deposited amount should be the same', async () => {
      const account = await server.loadAccount(testPubKey);
      const memo = StellarSdk.Memo.id(depositAddress.memo.toString());
      const depositAmount = 500;

      const transaction = new StellarSdk.TransactionBuilder(account)
        .addOperation(StellarSdk.Operation.payment({
          destination: depositAddress.address,
          asset: StellarSdk.Asset.native(),
          amount: depositAmount.toString(),
        }))
        .addMemo(memo)
        .build();
      transaction.sign(testKeyPair);
      
      const result = await server.submitTransaction(transaction);
      assert.ok(result);
      assert.equal(typeof result.hash, 'string');

      // Wait until stellar service is synced
      await sleep(10);
      
      const depositedAmount = stellarService.getDepositAmount(depositAddress.memo);
      assert.equal(depositedAmount, depositAmount);
    });
  });

  describe('Withdraw', function() {
    this.timeout(10 * 1000);
    it('Withdraw from multisig account', async() => {
      const result = await stellarService.Withdraw(testPubKey, 1000);
      assert.ok(result);
      assert.equal(typeof result.hash, 'string');
    });
  });
});