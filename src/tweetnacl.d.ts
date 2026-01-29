declare module 'tweetnacl' {
    export const secretbox: {
        (message: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
        open(box: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array | null;
        overheadLength: number;
        nonceLength: number;
        keyLength: number;
    };

    export const box: {
        (message: Uint8Array, nonce: Uint8Array, publicKey: Uint8Array, secretKey: Uint8Array): Uint8Array;
        open(box: Uint8Array, nonce: Uint8Array, publicKey: Uint8Array, secretKey: Uint8Array): Uint8Array | null;
        before(publicKey: Uint8Array, secretKey: Uint8Array): Uint8Array;
        keyPair(): { publicKey: Uint8Array; secretKey: Uint8Array };
        overheadLength: number;
        nonceLength: number;
        publicKeyLength: number;
        secretKeyLength: number;
        sharedKeyLength: number;
    };

    export const randomBytes: (length: number) => Uint8Array;

    export const sign: {
        (message: Uint8Array, secretKey: Uint8Array): Uint8Array;
        open(signedMessage: Uint8Array, publicKey: Uint8Array): Uint8Array | null;
        detached(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
        verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean;
        keyPair(): { publicKey: Uint8Array; secretKey: Uint8Array };
        fromSecretKey(secretKey: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array };
        fromSeed(seed: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array };
        publicKeyLength: number;
        secretKeyLength: number;
        seedLength: number;
        signatureLength: number;
    };

    export const hash: (message: Uint8Array) => Uint8Array;

    export const util: {
        decodeUTF8(utf8: string): Uint8Array;
        encodeUTF8(arr: Uint8Array): string;
        decodeBase64(b64: string): Uint8Array;
        encodeBase64(arr: Uint8Array): string;
    };
}
