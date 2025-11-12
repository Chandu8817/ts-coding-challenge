import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey, RequestType, KeyList,
  TopicCreateTransaction, TopicInfoQuery,
  TopicMessageQuery, TopicMessageSubmitTransaction
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";
import ConsensusSubmitMessage = RequestType.ConsensusSubmitMessage;

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

//Set the operator with the account ID and private key

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[0]
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey
  client.setOperator(this.account, privKey);

  //Create the query request
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const topicTx = await new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.privKey.publicKey)
    .freezeWith(client);

  const signedTopic = await topicTx.sign(this.privKey);
  const topicResponse = await signedTopic.execute(client);
  const topicReceipt = await topicResponse.getReceipt(client);

  assert.ok(topicReceipt.status.toString() === "SUCCESS", `TopicCreate failed: ${topicReceipt.status.toString()}`);

  this.topicId = topicReceipt.topicId;
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {

  const messageTx = await new TopicMessageSubmitTransaction()
    .setTopicId(this.topicId)
    .setMessage(message)
    .freezeWith(client);

  const signedMessage = await messageTx.sign(this.privKey);
  const messageResponse = await signedMessage.execute(client);
  const messageReceipt = await messageResponse.getReceipt(client);

  assert.ok(messageReceipt.status.toString() === "SUCCESS", `TopicMessageSubmit failed: ${messageReceipt.status.toString()}`);
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (message: string) {
  const messages: string[] = [];
  const query = new TopicMessageQuery()
    .setTopicId(this.topicId!)
    .setStartTime(new Date(Date.now() - 60_000));

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for topic message")), 30000);
    const handle = query.subscribe(
      client,
      (msg: any) => {
        const buf: Buffer = Buffer.isBuffer(msg.contents)
          ? msg.contents
          : Buffer.from(msg.contents ?? msg.message ?? "");
        const decoded = buf.toString("utf8");
        console.log(decoded);
        messages.push(decoded);
        if (buf.equals(Buffer.from(message, "utf8"))) {
          clearTimeout(timer);
          handle.unsubscribe();
          resolve();
        }
      },
      (err: any) => {
        clearTimeout(timer);
        try { handle.unsubscribe(); } catch {}
        reject(err);
      }
    );
  });

  assert.ok(messages.map((m) => m).includes(message));
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[1]
  const account: AccountId = AccountId.fromString(acc.id);
  this.secondAccount = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.secondPrivKey = privKey

  //Create the query request (no operator change needed)
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold: number, total: number) {
  const keys = [this.privKey.publicKey, this.secondPrivKey.publicKey];
  const keyList = new KeyList(keys).setThreshold(Number(threshold));
  this.thresholdKey = keyList;
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const topicTx = await new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.thresholdKey)
    .freezeWith(client);

  // threshold is 1 of 2 in the scenario; sign with first key
  const signedTopic = await topicTx.sign(this.privKey);
  const topicResponse = await signedTopic.execute(client);
  const topicReceipt = await topicResponse.getReceipt(client);

  assert.ok(topicReceipt.status.toString() === "SUCCESS", `TopicCreate(threshold) failed: ${topicReceipt.status.toString()}`);

  this.topicId = topicReceipt.topicId;
});
