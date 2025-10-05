import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatMsg, ChatService } from '../../chat.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss']
})
export class ChatComponent {
  constructor(public chat: ChatService) { }

  @ViewChild('scroller', { static: true }) scroller!: ElementRef<HTMLDivElement>;
  @ViewChild('endAnchor') endAnchor!: ElementRef<HTMLDivElement>;
  @ViewChild('composer') composer!: ElementRef<HTMLTextAreaElement>;

  input = '';
  showJump = false;
  autoStick = true;

  send() {
    const text = this.input.trim();
    if (!text) return;

    this.chat.addUserMessage(text);
    this.input = '';
    this.autosizeComposer();

    if (this.autoStick) this.scrollToBottom();
  }

  clear() { this.chat.clear(); }

  // UI helpers
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
}