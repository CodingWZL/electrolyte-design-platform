/// <reference types="vite/client" />
declare module 'react-simple-maps';
interface Window {
  $3Dmol: any;
  initRDKitModule?: (options: {
    locateFile: (filename: string) => string;
  }) => Promise<import("@rdkit/rdkit").RDKitModule>;
}
