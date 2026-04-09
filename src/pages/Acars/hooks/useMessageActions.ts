import { useState } from 'react';
import { useEFBStore } from '../../../store/efbStore';
import type { HoppieMessage } from '../../../services/hoppie';
import {
  hoppiePoll, hoppieSend,
} from '../../../services/hoppie';
import { playIncomingBeep, playCpdlcChime, playOpsBeep } from '../../../services/audio';
import { injectOps } from '../../../hooks/useOpsPhaseMessages';

export interface InlineReply {
  idx: number;
  fob: string;
  fl: string;
  eta: string;
}

export interface UseMessageActionsReturn {
  sendMsg: (to: string, type: string, packet: string) => Promise<void>;
  injectOps: (packet: string) => void;
  replyToMsg: (idx: number, to: string, packet: string, feedback?: string) => void;
  poll: () => Promise<void>;
  isResponded: (msg: HoppieMessage) => boolean;
  inlineReply: InlineReply | null;
  setInlineReply: React.Dispatch<React.SetStateAction<InlineReply | null>>;
}

export function useMessageActions(): UseMessageActionsReturn {
  const { hoppieLogon, addAcarsMessage, respondedMessageKeys, markMessageResponded } = useEFBStore();

  const callsign = useEFBStore(s => s.ofp?.atc?.callsign ?? '');

  const [inlineReply, setInlineReply] = useState<InlineReply | null>(null);

  function msgKey(msg: HoppieMessage): string {
    return `${msg.from ?? ''}|${new Date(msg.receivedAt).getTime()}`;
  }

  function isResponded(msg: HoppieMessage): boolean {
    return respondedMessageKeys.includes(msgKey(msg));
  }

  async function sendMsg(to: string, type: string, packet: string) {
    await hoppieSend(hoppieLogon, callsign, to, type, packet);
    addAcarsMessage({ from: callsign, to, type, packet, isSent: true, receivedAt: new Date() });
  }

  function replyToMsg(idx: number, to: string, packet: string, feedback?: string) {
    const msgs = useEFBStore.getState().acarsMessages;
    if (msgs[idx]) markMessageResponded(msgKey(msgs[idx]));
    sendMsg(to, 'telex', packet).catch(() => {});
    setInlineReply(null);
    if (feedback) {
      const delay = 2500 + Math.random() * 2500;
      setTimeout(() => injectOps(feedback), delay);
    }
  }

  async function poll() {
    const s = useEFBStore.getState();
    const cs = s.ofp?.atc?.callsign ?? '';
    if (!s.hoppieLogon || !cs) return;
    s.setHoppiePolling(true);
    try {
      const msgs = await hoppiePoll(s.hoppieLogon, cs);
      if (msgs.length > 0) {
        msgs.forEach(m => {
          s.addAcarsMessage(m);
          if (s.soundEnabled) {
            if (m.type === 'cpdlc') playCpdlcChime();
            else if (m.from?.endsWith('_ATIS') || m.from === 'OPSLINK') playOpsBeep();
            else playIncomingBeep();
          }
        });
        s.incrementAcarsUnread();
      }
      s.setHoppieError(null);
    } catch {
      s.setHoppieError('Poll failed');
    } finally {
      useEFBStore.getState().setHoppiePolling(false);
    }
  }

  return {
    sendMsg,
    injectOps,
    replyToMsg,
    poll,
    isResponded,
    inlineReply,
    setInlineReply,
  };
}
