// Declare the ReactNativeWebView global variable
declare global {
  interface Window {
    ReactNativeWebView: {
      postMessage(message: string): void;
    };
  }
}

declare type StringRecord<T> = Record<string, T>;
