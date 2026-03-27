import { useState, useEffect, useCallback } from 'react';
import {
  generateRsaKeyPair,
  exportPublicKeyJwk,
  exportPrivateKeyJwk,
  importPublicKeyJwk,
  importPrivateKeyJwk,
  exportPublicKeyBase64Url,
} from '@/services/crypto';

const STORAGE_KEY = 'secureshare_keypair';

interface KeyPairState {
  publicKey: CryptoKey | null;
  privateKey: CryptoKey | null;
  publicKeyBase64Url: string | null;
  loading: boolean;
}

export function useKeyPair() {
  const [state, setState] = useState<KeyPairState>({
    publicKey: null,
    privateKey: null,
    publicKeyBase64Url: null,
    loading: true,
  });

  // Load keys from localStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          setState(s => ({ ...s, loading: false }));
          return;
        }
        const { publicKeyJwk, privateKeyJwk } = JSON.parse(stored);
        const publicKey = await importPublicKeyJwk(publicKeyJwk);
        const privateKey = await importPrivateKeyJwk(privateKeyJwk);
        const publicKeyBase64Url = await exportPublicKeyBase64Url(publicKey);
        setState({ publicKey, privateKey, publicKeyBase64Url, loading: false });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setState({ publicKey: null, privateKey: null, publicKeyBase64Url: null, loading: false });
      }
    })();
  }, []);

  const generate = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    const { publicKey, privateKey } = await generateRsaKeyPair();
    const publicKeyJwk = await exportPublicKeyJwk(publicKey);
    const privateKeyJwk = await exportPrivateKeyJwk(privateKey);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ publicKeyJwk, privateKeyJwk }));
    const publicKeyBase64Url = await exportPublicKeyBase64Url(publicKey);
    setState({ publicKey, privateKey, publicKeyBase64Url, loading: false });
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ publicKey: null, privateKey: null, publicKeyBase64Url: null, loading: false });
  }, []);

  const exportKeys = useCallback(async () => {
    if (!state.publicKey || !state.privateKey) return null;
    const publicKeyJwk = await exportPublicKeyJwk(state.publicKey);
    const privateKeyJwk = await exportPrivateKeyJwk(state.privateKey);
    return { publicKeyJwk, privateKeyJwk };
  }, [state.publicKey, state.privateKey]);

  const importKeys = useCallback(async (data: { publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey }) => {
    setState(s => ({ ...s, loading: true }));
    const publicKey = await importPublicKeyJwk(data.publicKeyJwk);
    const privateKey = await importPrivateKeyJwk(data.privateKeyJwk);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const publicKeyBase64Url = await exportPublicKeyBase64Url(publicKey);
    setState({ publicKey, privateKey, publicKeyBase64Url, loading: false });
  }, []);

  return {
    ...state,
    generate,
    clear,
    exportKeys,
    importKeys,
  };
}
