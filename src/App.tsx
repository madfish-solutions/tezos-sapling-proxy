import { useEffect } from 'react';
import {
  InMemorySpendingKey,
  InMemoryViewingKey,
  SaplingToolkit,
  SaplingTransactionViewer
} from '@tezos-x/octez.js-sapling';
import { b58DecodeAndCheckPrefix } from '@tezos-x/octez.js-utils';
import { RpcReadAdapter } from '@tezos-x/octez.js';
import { RpcClient } from '@tezos-x/octez.js-rpc';
import Bip39 from 'bip39';
import { Buffer } from 'buffer';
import bs58check from 'bs58check';
import BigNumber from 'bignumber.js';

interface SaplingDerivationInput {
  mnemonic?: string;
  hdIndex?: number;
  privateKey?: string;
}

function getEntropyFromEdsk(edskString: string) {
  const decoded = bs58check.decode(edskString);
  const prefixLength = 4;
  const rawBytes = decoded.subarray(prefixLength);
  if (rawBytes.length === 64) {
    return rawBytes.subarray(0, 32);
  }
  return rawBytes;
};

function getMnemonicFromSecretKey(secretKey: string) {
  let entropy: Uint8Array | Buffer;

  if (secretKey.startsWith('spsk') || secretKey.startsWith('p2sk')) {
    [entropy] = b58DecodeAndCheckPrefix(secretKey);
  } else if (secretKey.startsWith('edsk')) {
    entropy = getEntropyFromEdsk(secretKey);
  } else {
    throw new Error('Invalid secret key');
  }

  return Bip39.entropyToMnemonic(Buffer.from(entropy));
}

async function getSpendingKey(input: SaplingDerivationInput) {
  const { mnemonic, hdIndex, privateKey } = input;
  if (mnemonic) {
    return InMemorySpendingKey.fromMnemonic(mnemonic, hdIndex === undefined ? undefined : `m/44'/1729'/${hdIndex}'/0'`);
  }

  if (privateKey) {
    return InMemorySpendingKey.fromMnemonic(getMnemonicFromSecretKey(privateKey));
  }

  throw new Error('No mnemonic or private key provided');
};

function App() {
  useEffect(() => {
    // @ts-expect-error - ReactNativeWebView is not typed
    if (!window.ReactNativeWebView) {
      return;
    }

    const postResponse = (response: unknown) => {
      // @ts-expect-error - ReactNativeWebView is not typed
      window.ReactNativeWebView.postMessage(JSON.stringify(response));
    }

    const messageHandler = async (event: MessageEvent) => {
      let parsedMessageId: string | undefined;
      try {
        console.log('messageHandler', event.data);
        const { method, id, payload } = JSON.parse(event.data);
        parsedMessageId = id;
        switch (method) {
          case 'saplingCredentials': {
            const spendingKey = await getSpendingKey(payload);
            const saplingViewingKeyProvider = await spendingKey.getSaplingViewingKeyProvider();

            postResponse({
              viewingKey: saplingViewingKeyProvider.getFullViewingKey().toString('hex'),
              saplingAddress: (await saplingViewingKeyProvider.getAddress()).address,
              id
            });
            break;
          }
          case 'accountState': {
            const { viewingKey, saplingContract, rpcUrl } = payload;
            const txViewer = new SaplingTransactionViewer(
              new InMemoryViewingKey(viewingKey),
              { contractAddress: saplingContract },
              new RpcReadAdapter(new RpcClient(rpcUrl))
            );
            const transactions = await txViewer.getIncomingAndOutgoingTransactions();
            let shieldedBalance = new BigNumber(0);
            transactions.incoming.forEach(transaction => {
              if (!transaction.isSpent) {
                shieldedBalance = shieldedBalance.plus(transaction.value);
              }
            });

            postResponse({
              shieldedBalance: shieldedBalance.toFixed(),
              transactions: {
                incoming: transactions.incoming.map(({ value, ...restProps }) => ({
                  value: value.toFixed(),
                  ...restProps
                })),
                outgoing: transactions.outgoing.map(({ value, ...restProps }) => ({
                  value: value.toFixed(),
                  ...restProps
                }))
              },
              id
            });
            break;
          }
          case 'prepareTransaction': {
            const { transaction, saplingContract, rpcUrl, ...derivationInput } = payload;
            const spendingKey = await getSpendingKey(derivationInput);
            const saplingToolkit = new SaplingToolkit(
              { saplingSigner: spendingKey },
              { contractAddress: saplingContract, memoSize: 8 },
              new RpcReadAdapter(new RpcClient(rpcUrl))
            );
            switch (transaction.type) {
              case 'unshielded':
                postResponse({ txData: await saplingToolkit.prepareUnshieldedTransaction(transaction.params), id });
                break;
              case 'shielded':
                postResponse({ txData: await saplingToolkit.prepareShieldedTransaction(transaction.params), id });
                break;
              case 'sapling':
                postResponse({ txData: await saplingToolkit.prepareSaplingTransaction(transaction.params), id });
                break;
              default:
                throw new Error(`Invalid transaction type: ${transaction.type}`);
            }
            break;
          }
          default:
            throw new Error(`Invalid method: ${method}`);
        }
      } catch (error) {
        console.error(error);
        postResponse({ error: error instanceof Error ? error.message : String(error), id: parsedMessageId });
      }
    };
    window.addEventListener('message', messageHandler);
    // @ts-expect-error - This is the listener for Android
    document.addEventListener('message', messageHandler);

    return () => {
      window.removeEventListener('message', messageHandler);
      // @ts-expect-error - This is the listener for Android
      document.removeEventListener('message', messageHandler);
    };
  }, []);

  return (
    <p>Proxy for Tezos Sapling</p>
  )
}

export default App
