import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../environments/environment';

export type Role = 'system' | 'user' | 'assistant';
export interface ChatMsg { role: Role; content: string; }

@Injectable({ providedIn: 'root' })
export class ChatService {

  private history = new BehaviorSubject<ChatMsg[]>([]); // start empty
  history$ = this.history.asObservable();

  private loading = new BehaviorSubject<boolean>(false);
  loading$ = this.loading.asObservable();

  private get apiUrl() {
    // default to /api when not overridden
    const base = environment.apiBaseUrl || '/api';
    return `${base}/chat`;
  }

  addUserMessage(text: string) {
    const next = [...this.history.value, { role: 'user' as Role, content: text }];
    this.history.next(next);
    this.ask();
  }

  clear() {
    this.history.next([]); // no default system text
  }

  private buildMessagesForAPI() {
    return this.history.value.map(m => ({ role: m.role, content: m.content }));
  }

  // ---------- Non-streaming ----------
  async completeOnce(): Promise<void> {
    this.loading.next(true);
    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // no Authorization here
        body: JSON.stringify({
          model: 'openai/gpt-4o',
          messages: this.buildMessagesForAPI()
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      this.pushAssistantFull(text);
    } catch (e) {
      this.pushAssistantFull(`(error) ${(e as Error).message}`);
    } finally {
      this.loading.next(false);
    }
  }

  // ---------- Streaming ----------
  async ask(): Promise<void> {
    this.loading.next(true);
    const startIdx = this.pushAssistantFull('');

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // no Authorization here
        body: JSON.stringify({
          model: 'openai/gpt-4o',
          messages: this.buildMessagesForAPI(),
          stream: true
        })
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
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;

          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content ?? '';
            if (delta) this.appendToAssistant(startIdx, delta);
          } catch {
            // ignore partial/keep-alive lines
          }
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