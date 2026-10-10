import { Capacitor, registerPlugin } from '@capacitor/core';

export interface XtreamCredentialDraft {
  name: string;
  serverUrl: string;
  username: string;
  password: string;
}

interface NativeCredentialPlugin {
  saveCredentialDraft(options: XtreamCredentialDraft): Promise<void>;
  loadCredentialDraft(): Promise<Partial<XtreamCredentialDraft>>;
  clearCredentialDraft(): Promise<void>;
}

const NativeProvider = registerPlugin<NativeCredentialPlugin>('GetSmartProvider');

const SESSION_KEY = 'getsmart_xtream_draft_session_v1';

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function saveXtreamCredentialDraft(draft: XtreamCredentialDraft): Promise<void> {
  if (isNativeAndroid()) {
    await NativeProvider.saveCredentialDraft(draft);
    return;
  }

  // Browser/PWA fallback is intentionally session-scoped so a password is not
  // written to durable browser storage.
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(draft));
  } catch {
    // Best effort only.
  }
}

export async function loadXtreamCredentialDraft(): Promise<Partial<XtreamCredentialDraft>> {
  if (isNativeAndroid()) {
    return await NativeProvider.loadCredentialDraft();
  }

  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function clearXtreamCredentialDraft(): Promise<void> {
  if (isNativeAndroid()) {
    await NativeProvider.clearCredentialDraft();
    return;
  }

  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Best effort only.
  }
}
