
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Role = 'system' | 'user' | 'assistant';
export interface ChatMsg { role: Role; content: string; }

@Injectable({ providedIn: 'root' })
export class ChatService {
  private history = new BehaviorSubject<ChatMsg[]>([
    { role: 'system', content: 'You are DVV Assistant. Be concise and helpful.' }
  ]);
  history$ = this.history.asObservable();

  private loading = new BehaviorSubject<boolean>(false);
  loading$ = this.loading.asObservable();

  addUserMessage(text: string) {
    const next = [...this.history.value, { role: 'user' as Role, content: text }];
    this.history.next(next);
    this.ask();
  }

  clear() {
    this.history.next([{ role: 'system', content: 'You are DVV Assistant. Be concise and helpful.' }]);
  }

  private buildMessagesForAPI() {
    return this.history.value.map(m => ({ role: m.role, content: m.content }));
  }

  async ask(): Promise<void> {
    this.loading.next(true);
    const startIdx = this.pushAssistantFull('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: this.buildMessagesForAPI() })
      });

      if (!res.ok || !res.body) {
        throw new Error(`Network/SSE error: ${res.status} ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json?.delta ?? '';   // ← our Edge function sends { delta }
            if (delta) this.appendToAssistant(startIdx, delta);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      this.appendToAssistant(-1, `\n(error) ${(e as Error).message}`);
    } finally {
      this.loading.next(false);
    }
  }

  private pushAssistantFull(text: string): number {
    const msgs = [...this.history.value, { role: 'assistant', content: text } as ChatMsg];
    this.history.next(msgs);
    return msgs.length - 1;
  }

  private appendToAssistant(index: number, delta: string) {
    const msgs = [...this.history.value];
    const i = index >= 0 ? index : msgs.length - 1;
    if (!msgs[i] || msgs[i].role !== 'assistant') return;
    msgs[i] = { ...msgs[i], content: msgs[i].content + delta };
    this.history.next(msgs);
  }
}