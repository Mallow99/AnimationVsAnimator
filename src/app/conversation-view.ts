import type { LogLine } from '../core/brain';

/** Append new messages without rebuilding the live region or moving a reader away from history. */
export function transcriptView(box: HTMLElement) {
  let previous: string[] = [], identity = '';
  return (log: LogLine[], name: string, owner: string) => {
    const keys = log.map(l => JSON.stringify(l));
    if (identity === owner && keys.length === previous.length && keys.every((k,i) => k === previous[i])) return;
    const same = identity === owner;
    const bottom = !same || box.scrollHeight - box.scrollTop - box.clientHeight < 36;
    const top = box.scrollTop, oldHeight = box.scrollHeight;
    const append = same && previous.length > 0 && previous.every((k,i) => keys[i] === k);
    if (!append) box.replaceChildren();
    for (const l of log.slice(append ? previous.length : 0)) {
      const p = document.createElement('p'); p.className = l.who;
      p.setAttribute('aria-label', l.who === 'you' ? 'You' : l.who === 'him' ? name : 'Conversation note');
      p.textContent = l.text || (l.acts ? '' : '…');
      if (l.acts) { const a = document.createElement('span'); a.className = 'acts'; a.textContent = `\n${l.acts}`; p.append(a); }
      box.append(p);
    }
    if (!log.length) {
      const p = document.createElement('p'); p.className = 'note';
      p.textContent = `Say hi to ${name}. Ask about their day, share an idea, or try “tell me a story”.`;
      box.append(p);
    }
    if (bottom) box.scrollTop = box.scrollHeight;
    else box.scrollTop = append ? top : Math.max(0, top + box.scrollHeight - oldHeight);
    previous = keys; identity = owner;
  };
}

export function exportConversation(log: LogLine[], name: string) {
  const text = log.map(l => `${l.who === 'you' ? 'You' : l.who === 'him' ? name : 'Note'}: ${l.text}${l.acts ? `\n[${l.acts}]` : ''}`).join('\n\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `${name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 50) || 'figure'}-conversation.txt`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Enter sends; Shift+Enter adds a paragraph. IME composition must never submit a partial word. */
export function conversationKeys(input: HTMLTextAreaElement, form: HTMLFormElement) {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault(); if (input.value.trim()) form.requestSubmit();
    }
  });
}
