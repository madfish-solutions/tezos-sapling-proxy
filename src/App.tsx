import { useEffect } from 'react';
import {
  getProofAuthorizingKey,
  prepareSpendDescriptionWithAuthorizingKey,
  deriveEphemeralPublicKey,
  getOutgoingViewingKey,
  getRawPaymentAddressFromIncomingViewingKey,
  keyAgreement,
  getPkdFromRawPaymentAddress
} from '@tezos-x/sapling-wasm';
import { Buffer } from 'buffer';

const fromBase64 = (base64: string) => Buffer.from(base64, 'base64');

const postMessage = (message: unknown) => {
  // @ts-expect-error - ReactNativeWebView is not typed
  window.ReactNativeWebView.postMessage(JSON.stringify(message));
};

function App() {
  useEffect(() => {
    // @ts-expect-error - ReactNativeWebView is not typed
    if (!window.ReactNativeWebView) {
      return;
    }

    const messageHandler = async (event: MessageEvent) => {
      let parsedMessageId: string | undefined;
      try {
        console.log('messageHandler', event.data);
        const { method, id, payload } = JSON.parse(event.data);
        parsedMessageId = id;

        const postBase64Result = (result: Buffer) => {
          postMessage({ result: result.toString('base64'), id });
        };

        switch (method) {
          case 'getProofAuthorizingKey': {
            const { spendingKey } = payload;
            postBase64Result(await getProofAuthorizingKey(fromBase64(spendingKey)));
            break;
          }
          case 'prepareSpendDescriptionWithAuthorizingKey': {
            const {
              saplingContext,
              provingKey,
              address,
              randomCommitmentTrapdoor,
              publicKeyReRandomization,
              amount,
              root,
              witness
            } = payload;
            const { cv, nf, rk, rt, proof } = await prepareSpendDescriptionWithAuthorizingKey(
              Number(saplingContext),
              fromBase64(provingKey),
              fromBase64(address),
              fromBase64(randomCommitmentTrapdoor),
              fromBase64(publicKeyReRandomization),
              amount,
              fromBase64(root),
              fromBase64(witness)
            );
            postMessage({
              result: {
                cv: cv.toString('base64'),
                nf: nf.toString('base64'),
                rk: rk.toString('base64'),
                rt: rt.toString('base64'),
                proof: proof.toString('base64')
              },
              id
            });
            break;
          }
          case 'deriveEpkFromEsk': {
            const { diversifier, esk } = payload;
            postBase64Result(await deriveEphemeralPublicKey(fromBase64(diversifier), fromBase64(esk)));
            break;
          }
          case 'getOutgoingViewingKey': {
            const { spendingKey } = payload;
            postBase64Result(await getOutgoingViewingKey(fromBase64(spendingKey)));
            break;
          }
          case 'getRawPaymentAddress': {
            const { incomingViewingKey, diversifier } = payload;
            postBase64Result(await getRawPaymentAddressFromIncomingViewingKey(
              fromBase64(incomingViewingKey),
              fromBase64(diversifier)
            ));
            break;
          }
          case 'keyAgreement': {
            const { p, sk } = payload;
            postBase64Result(await keyAgreement(fromBase64(p), fromBase64(sk)));
            break;
          }
          case 'getPkdFromRawPaymentAddress': {
            const { address } = payload;
            postBase64Result(await getPkdFromRawPaymentAddress(fromBase64(address)));
            break;
          }
          default:
            throw new Error(`Invalid method: ${method}`);
        }
      } catch (error) {
        console.error(error);
        postMessage({ error: error instanceof Error ? error.message : String(error), id: parsedMessageId });
      }
    };
    window.addEventListener('message', messageHandler);
    // @ts-expect-error - This is the listener for Android
    document.addEventListener('message', messageHandler);

    postMessage({ ready: true });

    return () => {
      window.removeEventListener('message', messageHandler);
      // @ts-expect-error - This is the listener for Android
      document.removeEventListener('message', messageHandler);
    };
  }, [postMessage]);

  return (
    <p>Proxy for Tezos Sapling</p>
  )
}

export default App
