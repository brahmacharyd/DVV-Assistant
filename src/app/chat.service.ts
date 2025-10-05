import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Role = 'system' | 'user' | 'assistant';
export interface ChatMsg { role: Role; content: string; }

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly OPENROUTER_KEY = import.meta.env.OPENROUTER_API_KEY || ''

  
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

  async completeOnce(): Promise<void> {
    this.loading.next(true);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.OPENROUTER_KEY}`,
          'X-Title': 'DVV Agent (Client Demo)'
        },
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

  async ask(): Promise<void> {
    this.loading.next(true);

    const startIdx = this.pushAssistantFull('');

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.OPENROUTER_KEY}`,
          'X-Title': 'DVV Agent (Client Demo)'
        },
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