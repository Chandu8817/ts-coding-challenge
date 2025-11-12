import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import { AccountBalanceQuery, AccountId, Client, PrivateKey, TokenAssociateTransaction, TokenCreateTransaction, TokenInfoQuery, TokenMintTransaction, TransferTransaction } from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet()

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[0]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

//Create the query request
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)

});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const account = accounts[0];
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  // create token (2 decimals as scenario expects)
  const tokenTx = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(0)            // mint later via supplyKey
    .setTreasuryAccountId(MY_ACCOUNT_ID)
    .setAdminKey(MY_PRIVATE_KEY.publicKey)
    .setFreezeKey(MY_PRIVATE_KEY.publicKey)
    .setKycKey(MY_PRIVATE_KEY.publicKey)
    .setWipeKey(MY_PRIVATE_KEY.publicKey)
    .setSupplyKey(MY_PRIVATE_KEY.publicKey) // keep supply control
    .freezeWith(client);

  // sign using treasury / admin / supply key
  const signed = await tokenTx.sign(MY_PRIVATE_KEY);
  const txResponse = await signed.execute(client);
  const receipt = await txResponse.getReceipt(client);

  assert.ok(receipt.status.toString() === "SUCCESS", `TokenCreate failed: ${receipt.status.toString()}`);

  this.tokenId = receipt.tokenId;
  // fetch token info for later assertions
  this.tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  this.treasury = MY_ACCOUNT_ID;
  this.supplyKey = MY_PRIVATE_KEY;
});
Then(/^The token has the name "([^"]*)"$/, async function (expectedName: string) {
  assert.ok(this.tokenInfo, "tokenInfo not set");
  assert.strictEqual(this.tokenInfo.name, expectedName);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (expectedSymbol: string) {
  assert.ok(this.tokenInfo, "tokenInfo not set");
  assert.strictEqual(this.tokenInfo.symbol, expectedSymbol);
});

Then(/^The token has (\d+) decimals$/, async function (expectedDecimals: number) {
  assert.ok(this.tokenInfo, "tokenInfo not set");
  assert.strictEqual(Number(this.tokenInfo.decimals), Number(expectedDecimals));
});

Then(/^The token is owned by the account$/, async function () {
  assert.ok(this.treasury, "treasury not set");
  // validate treasury holds token (AccountInfo or TokenInfo contains treasury)
  assert.ok(this.tokenInfo.treasuryAccountId, "tokenInfo.treasuryAccountId missing");
  assert.strictEqual(this.tokenInfo.treasuryAccountId.toString(), this.treasury.toString());
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (amountToMint: number) {
  assert.ok(this.tokenId, "tokenId not set");
  assert.ok(this.supplyKey, "supplyKey not set");

  const mintTx = new TokenMintTransaction()
    .setTokenId(this.tokenId)
    .setAmount(Number(amountToMint))
    .freezeWith(client);

  const signedMint = await mintTx.sign(this.supplyKey);
  const mintResponse = await signedMint.execute(client);
  const mintReceipt = await mintResponse.getReceipt(client);

  assert.ok(mintReceipt.status.toString() === "SUCCESS", `Mint failed: ${mintReceipt.status.toString()}`);

  // refresh token info after mint
  this.tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
});
When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (
  initialSupply: number
) {
  const account = accounts[0];
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  const tokenTx = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(Number(initialSupply))
    .setTreasuryAccountId(MY_ACCOUNT_ID)
    .setAdminKey(MY_PRIVATE_KEY.publicKey)
    .setFreezeKey(MY_PRIVATE_KEY.publicKey)
    .setKycKey(MY_PRIVATE_KEY.publicKey)
    .setWipeKey(MY_PRIVATE_KEY.publicKey)
    .freezeWith(client); // no supplyKey => fixed supply

  const signed = await tokenTx.sign(MY_PRIVATE_KEY);
  const txResponse = await signed.execute(client);
  const receipt = await txResponse.getReceipt(client);

  assert.ok(receipt.status.toString() === "SUCCESS", `TokenCreate failed: ${receipt.status.toString()}`);

  this.tokenId = receipt.tokenId;
  this.tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  this.treasury = MY_ACCOUNT_ID;
  this.supplyKey = undefined;
});
Then(/^The total supply of the token is (\d+)$/, async function (
  initialSupply: number
) {
  assert.ok(this.tokenInfo, "tokenInfo not set");
  assert.strictEqual(Number(this.tokenInfo.totalSupply), Number(initialSupply));
});
Then(/^An attempt to mint tokens fails$/, async function (
  amountToMint: number
) {
  assert.ok(this.tokenId, "tokenId not set");
  const mintTx =  new TokenMintTransaction()
    .setTokenId(this.tokenId)
    .setAmount(Number(amountToMint))
    .freezeWith(client);

  // Intentionally do not sign with a supply key; fixed supply should not have one
  const mintResponse = await mintTx.execute(client);
  const mintReceipt = await mintResponse.getReceipt(client);

  assert.ok(mintReceipt.status.toString() === "TOKEN_HAS_NO_SUPPLY_KEY", `Unexpected status: ${mintReceipt.status.toString()}`);
});
Given(/^A first hedera account with more than (\d+) hbar$/, async function (
  expectedBalance: number
) {
  const account = accounts[0]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

//Create the query request
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)

});
Given(/^A second Hedera account$/, async function (
  expectedBalance: number
) {
  const account = accounts[1]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

//Create the query request
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client)
  // assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)

});
Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (
  initialSupply: number
) {
  const account = accounts[0];
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  const tokenTx = new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(Number(initialSupply))
    .setTreasuryAccountId(MY_ACCOUNT_ID)
    .setAdminKey(MY_PRIVATE_KEY.publicKey)
    .setFreezeKey(MY_PRIVATE_KEY.publicKey)
    .setKycKey(MY_PRIVATE_KEY.publicKey)
    .setWipeKey(MY_PRIVATE_KEY.publicKey)
    .setSupplyKey(MY_PRIVATE_KEY.publicKey)
    .freezeWith(client);

  const signed = await tokenTx.sign(MY_PRIVATE_KEY);
  const txResponse = await signed.execute(client);
  const receipt = await txResponse.getReceipt(client);

  assert.ok(receipt.status.toString() === "SUCCESS", `TokenCreate failed: ${receipt.status.toString()}`);

  this.tokenId = receipt.tokenId;
  this.tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  this.treasury = MY_ACCOUNT_ID;
  this.supplyKey = MY_PRIVATE_KEY;
});
Given(/^The first account holds (\d+) HTT tokens$/, async function (
  expectedBalance: number
) {
  const first = accounts[0];
  const FIRST_ID = AccountId.fromString(first.id);
  const FIRST_KEY = PrivateKey.fromStringED25519(first.privateKey);
  const TREASURY_ID: AccountId = this.treasury;
  const TREASURY_KEY: PrivateKey = this.supplyKey ?? FIRST_KEY;
  const PARK_ID = AccountId.fromString(accounts[4].id);
  const PARK_KEY = PrivateKey.fromStringED25519(accounts[4].privateKey);

  // Ensure association for first account
  client.setOperator(FIRST_ID, FIRST_KEY);
  try {
    const assoc = new TokenAssociateTransaction().setAccountId(FIRST_ID).setTokenIds([this.tokenId]).freezeWith(client);
    const assocSigned = await assoc.sign(FIRST_KEY);
    await (await assocSigned.execute(client)).getReceipt(client);
  } catch {}

  // Adjust balance safely, considering treasury may equal FIRST_ID
  const current = (await new AccountBalanceQuery().setAccountId(FIRST_ID).execute(client))?.tokens?.get(this.tokenId)?.toNumber() ?? 0;
  const delta = Number(expectedBalance) - Number(current);
  if (delta === 0) return;

  // Associate parking account
  client.setOperator(PARK_ID, PARK_KEY);
  try {
    const assocP = new TokenAssociateTransaction().setAccountId(PARK_ID).setTokenIds([this.tokenId]).freezeWith(client);
    const assocPSigned = await assocP.sign(PARK_KEY);
    await (await assocPSigned.execute(client)).getReceipt(client);
  } catch {}

  client.setOperator(TREASURY_ID, TREASURY_KEY);
  if (delta < 0) {
    // Need to move tokens out of FIRST (treasury) to parking
    const amount = -delta;
    const tx = new TransferTransaction()
      .addTokenTransfer(this.tokenId, TREASURY_ID, -amount)
      .addTokenTransfer(this.tokenId, PARK_ID, amount)
      .freezeWith(client);
    const signed = await tx.sign(TREASURY_KEY);
    await (await signed.execute(client)).getReceipt(client);
  } else {
    // Need to increase FIRST balance; if we have supplyKey (mintable), mint to treasury, otherwise pull back from parking
    if (this.supplyKey) {
      const mintTx = new TokenMintTransaction().setTokenId(this.tokenId).setAmount(delta).freezeWith(client);
      const mintSigned = await mintTx.sign(TREASURY_KEY);
      await (await mintSigned.execute(client)).getReceipt(client);
    } else {
      const tx = new TransferTransaction()
        .addTokenTransfer(this.tokenId, PARK_ID, -delta)
        .addTokenTransfer(this.tokenId, TREASURY_ID, delta)
        .freezeWith(client);
      const signed = await tx.sign(PARK_KEY);
      await (await signed.execute(client)).getReceipt(client);
    }
  }
});
Given(/^The second account holds (\d+) HTT tokens$/, async function (
  expectedBalance: number
) {
  const second = accounts[1];
  const SECOND_ID = AccountId.fromString(second.id);
  const SECOND_KEY = PrivateKey.fromStringED25519(second.privateKey);
  const TREASURY_ID: AccountId = this.treasury;
  const TREASURY_KEY: PrivateKey = this.supplyKey ?? PrivateKey.fromStringED25519(accounts[0].privateKey);

  // Ensure association for second account
  client.setOperator(SECOND_ID, SECOND_KEY);
  try {
    const assoc = new TokenAssociateTransaction().setAccountId(SECOND_ID).setTokenIds([this.tokenId]).freezeWith(client);
    const assocSigned = await assoc.sign(SECOND_KEY);
    await (await assocSigned.execute(client)).getReceipt(client);
  } catch {}

  const current = (await new AccountBalanceQuery().setAccountId(SECOND_ID).execute(client))?.tokens?.get(this.tokenId)?.toNumber() ?? 0;
  const delta = Number(expectedBalance) - Number(current);
  if (delta !== 0) {
    client.setOperator(TREASURY_ID, TREASURY_KEY);
    const tx = new TransferTransaction()
      .addTokenTransfer(this.tokenId, TREASURY_ID, -delta)
      .addTokenTransfer(this.tokenId, SECOND_ID, delta)
      .freezeWith(client);
    const signed = await tx.sign(TREASURY_KEY);
    await (await signed.execute(client)).getReceipt(client);
  }
});


When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (
  amount: number
) {
  const first = accounts[0];
  const FIRST_ID = AccountId.fromString(first.id);
  const FIRST_KEY = PrivateKey.fromStringED25519(first.privateKey);
  const second = accounts[1];
  const SECOND_ID = AccountId.fromString(second.id);

  const tx = new TransferTransaction()
    .addTokenTransfer(this.tokenId, FIRST_ID, -Number(amount))
    .addTokenTransfer(this.tokenId, SECOND_ID, Number(amount))
    .freezeWith(client);
  this.pendingTx = await tx.sign(FIRST_KEY);
});
When(/^The first account submits the transaction$/, async function () {
  assert.ok(this.pendingTx, "no pendingTx");
  const first = accounts[0];
  const FIRST_ID = AccountId.fromString(first.id);
  const FIRST_KEY = PrivateKey.fromStringED25519(first.privateKey);
  client.setOperator(FIRST_ID, FIRST_KEY);
  const resp = await this.pendingTx.execute(client);
  this.lastRecord = await resp.getRecord(client);
});
When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function (
  amount: number
) {
  const first = accounts[0];
  const FIRST_ID = AccountId.fromString(first.id);
  const second = accounts[1];
  const SECOND_ID = AccountId.fromString(second.id);
  const SECOND_KEY = PrivateKey.fromStringED25519(second.privateKey);

  const tx = new TransferTransaction()
    .addTokenTransfer(this.tokenId, SECOND_ID, -Number(amount))
    .addTokenTransfer(this.tokenId, FIRST_ID, Number(amount))
    .freezeWith(client);
  this.pendingTx = await tx.sign(SECOND_KEY);
});
Then(/^The first account has paid for the transaction fee$/, async function () {
  assert.ok(this.lastRecord, "no lastRecord");
  const payer = this.lastRecord.transactionId.accountId;
  assert.strictEqual(payer.toString(), accounts[0].id);
});
Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function (
  _minHbar: number, tokens: number
) {
  // Reuse logic by delegating to the single-account step
  await (this as any).Given(/^The first account holds (\d+) HTT tokens$/, async () => {})(tokens);
});

Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (
  _hbar: number, tokens: number
) {
  const second = accounts[1];
  const SECOND_ID = AccountId.fromString(second.id);
  const SECOND_KEY = PrivateKey.fromStringED25519(second.privateKey);
  const TREASURY_ID: AccountId = this.treasury;
  const TREASURY_KEY: PrivateKey = this.supplyKey ?? PrivateKey.fromStringED25519(accounts[0].privateKey);

  client.setOperator(SECOND_ID, SECOND_KEY);
  try {
    const assoc = new TokenAssociateTransaction().setAccountId(SECOND_ID).setTokenIds([this.tokenId]).freezeWith(client);
    const assocSigned = await assoc.sign(SECOND_KEY);
    await (await assocSigned.execute(client)).getReceipt(client);
  } catch {}

  client.setOperator(TREASURY_ID, TREASURY_KEY);
  const current = (await new AccountBalanceQuery().setAccountId(SECOND_ID).execute(client))?.tokens?.get(this.tokenId)?.toNumber() ?? 0;
  const delta = Number(tokens) - Number(current);
  if (delta !== 0) {
    const tx = new TransferTransaction()
      .addTokenTransfer(this.tokenId, TREASURY_ID, -delta)
      .addTokenTransfer(this.tokenId, SECOND_ID, delta)
      .freezeWith(client);
    const signed = await tx.sign(TREASURY_KEY);
    await (await signed.execute(client)).getReceipt(client);
  }
});

Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (
  _hbar: number, tokens: number
) {
  const third = accounts[2];
  const THIRD_ID = AccountId.fromString(third.id);
  const THIRD_KEY = PrivateKey.fromStringED25519(third.privateKey);
  const TREASURY_ID: AccountId = this.treasury;
  const TREASURY_KEY: PrivateKey = this.supplyKey ?? PrivateKey.fromStringED25519(accounts[0].privateKey);

  client.setOperator(THIRD_ID, THIRD_KEY);
  try {
    const assoc = new TokenAssociateTransaction().setAccountId(THIRD_ID).setTokenIds([this.tokenId]).freezeWith(client);
    const assocSigned = await assoc.sign(THIRD_KEY);
    await (await assocSigned.execute(client)).getReceipt(client);
  } catch {}

  client.setOperator(TREASURY_ID, TREASURY_KEY);
  const current = (await new AccountBalanceQuery().setAccountId(THIRD_ID).execute(client))?.tokens?.get(this.tokenId)?.toNumber() ?? 0;
  const delta = Number(tokens) - Number(current);
  if (delta !== 0) {
    const tx = new TransferTransaction()
      .addTokenTransfer(this.tokenId, TREASURY_ID, -delta)
      .addTokenTransfer(this.tokenId, THIRD_ID, delta)
      .freezeWith(client);
    const signed = await tx.sign(TREASURY_KEY);
    await (await signed.execute(client)).getReceipt(client);
  }
});

Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (
  _hbar: number, tokens: number
) {
  const fourth = accounts[3];
  const FOURTH_ID = AccountId.fromString(fourth.id);
  const FOURTH_KEY = PrivateKey.fromStringED25519(fourth.privateKey);
  const TREASURY_ID: AccountId = this.treasury;
  const TREASURY_KEY: PrivateKey = this.supplyKey ?? PrivateKey.fromStringED25519(accounts[0].privateKey);

  client.setOperator(FOURTH_ID, FOURTH_KEY);
  try {
    const assoc = new TokenAssociateTransaction().setAccountId(FOURTH_ID).setTokenIds([this.tokenId]).freezeWith(client);
    const assocSigned = await assoc.sign(FOURTH_KEY);
    await (await assocSigned.execute(client)).getReceipt(client);
  } catch {}

  client.setOperator(TREASURY_ID, TREASURY_KEY);
  const current = (await new AccountBalanceQuery().setAccountId(FOURTH_ID).execute(client))?.tokens?.get(this.tokenId)?.toNumber() ?? 0;
  const delta = Number(tokens) - Number(current);
  if (delta !== 0) {
    const tx = new TransferTransaction()
      .addTokenTransfer(this.tokenId, TREASURY_ID, -delta)
      .addTokenTransfer(this.tokenId, FOURTH_ID, delta)
      .freezeWith(client);
    const signed = await tx.sign(TREASURY_KEY);
    await (await signed.execute(client)).getReceipt(client);
  }
});

When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (
  amt12: number, amt3: number, amt4: number
) {
  const first = accounts[0];
  const FIRST_ID = AccountId.fromString(first.id);
  const FIRST_KEY = PrivateKey.fromStringED25519(first.privateKey);
  const second = accounts[1];
  const SECOND_ID = AccountId.fromString(second.id);
  const SECOND_KEY = PrivateKey.fromStringED25519(second.privateKey);
  const third = accounts[2];
  const THIRD_ID = AccountId.fromString(third.id);
  const fourth = accounts[3];
  const FOURTH_ID = AccountId.fromString(fourth.id);

  const tx = new TransferTransaction()
    .addTokenTransfer(this.tokenId, FIRST_ID, -Number(amt12))
    .addTokenTransfer(this.tokenId, SECOND_ID, -Number(amt12))
    .addTokenTransfer(this.tokenId, THIRD_ID, Number(amt3))
    .addTokenTransfer(this.tokenId, FOURTH_ID, Number(amt4))
    .freezeWith(client);

  const signedByFirst = await tx.sign(FIRST_KEY);
  this.pendingTx = await signedByFirst.sign(SECOND_KEY);
});

Then(/^The third account holds (\d+) HTT tokens$/, async function (
  expected: number
) {
  const third = accounts[2];
  const THIRD_ID = AccountId.fromString(third.id);
  const bal = await new AccountBalanceQuery().setAccountId(THIRD_ID).execute(client);
  assert.strictEqual(bal?.tokens?.get(this.tokenId)?.toNumber() ?? 0, Number(expected));
});
Then(/^The fourth account holds (\d+) HTT tokens$/, async function (
  expected: number
) {
  const fourth = accounts[3];
  const FOURTH_ID = AccountId.fromString(fourth.id);
  const bal = await new AccountBalanceQuery().setAccountId(FOURTH_ID).execute(client);
  assert.strictEqual(bal?.tokens?.get(this.tokenId)?.toNumber() ?? 0, Number(expected));
});
