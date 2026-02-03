/// <reference types="vite/client" />

// Vite worker imports
declare module '*?worker&inline' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module '*?worker&url' {
  const url: string;
  export default url;
}
