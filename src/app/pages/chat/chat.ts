import { Component, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatMsg, ChatService } from '../../chat.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss']
})
export class ChatComponent implements OnDestroy {
  constructor(public chat: ChatService) { }

  @ViewChild('scroller', { static: true }) scroller!: ElementRef<HTMLDivElement>;
  @ViewChild('endAnchor') endAnchor!: ElementRef<HTMLDivElement>;
  @ViewChild('composer') composer!: ElementRef<HTMLTextAreaElement>;

  input = '';
  showJump = false;
  autoStick = true;

  sending = false;
  private activeSub?: Subscription;
  private abort?: AbortController;

  async send() {
    if (this.sending) { this.stop(); return; }

    const text = this.input.trim();
    if (!text) return;

    this.chat.addUserMessage(text);
    this.input = '';
    this.autosizeComposer();
    if (this.autoStick) this.scrollToBottom();

    this.sending = true;

    if (typeof (this.chat as any).send$ === 'function') {
      this.activeSub = (this.chat as any).send$(text).subscribe({
        error: () => { this.sending = false; },
        complete: () => { this.sending = false; }
      });
      return;
    }

    if (typeof (this.chat as any).send === 'function') {
      this.abort = new AbortController();
      try {
        await (this.chat as any).send(text, { signal: this.abort.signal });
      } catch (_e) {
      } finally {
        this.sending = false;
        this.abort = undefined;
      }
      return;
    }

    this.sending = false;
  }

  stop() {
    if (this.activeSub) {
      this.activeSub.unsubscribe();
      this.activeSub = undefined;
    }
    if (this.abort) {
      this.abort.abort();
      this.abort = undefined;
    }
    (this.chat as any).cancel?.();

    this.sending = false;
  }

  clear() { if (!this.sending) this.chat.clear(); }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
  }
  onScroll() {
    const el = this.scroller.nativeElement;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    this.autoStick = nearBottom; this.showJump = !nearBottom;
  }
  jumpToLatest() { this.autoStick = true; this.scrollToBottom(); }
  scrollToBottom() {
    queueMicrotask(() => this.endAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  }
  autosizeComposer() {
    const ta = this.composer.nativeElement;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, Math.round(window.innerHeight * 0.4)) + 'px';
  }

  trackByIdx(i: number, _m: ChatMsg) { return i; }

  ngOnDestroy(): void {
    this.stop();
  }
}