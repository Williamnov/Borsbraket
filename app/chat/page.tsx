"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteDoc, doc } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { Avatar, Empty, PageHead, RequirePlayer, Reveal } from "@/components/ui";
import { firestore } from "@/lib/firebase/client";
import { postChatMessage } from "@/lib/chat";
import { markChatRead } from "@/lib/chatRead";
import { useChat, useLeagueBase } from "@/lib/hooks";
import { displayName, timeAgo } from "@/lib/format";
import {
  CHAT_MIN_GAP_SECONDS,
  MAX_MESSAGE_CHARS,
  toDate,
  type ChatMessage,
  type Profile,
} from "@/lib/types";

export default function ChatPage() {
  return (
    <RequirePlayer>
      <Board />
    </RequirePlayer>
  );
}

type Thread = { root: ChatMessage; replies: ChatMessage[]; orphaned: boolean };

function Board() {
  const { profile, isAdmin } = useAuth();
  const { profileMap } = useLeagueBase(true);
  const { messages, loading, error } = useChat(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  // The rules enforce the gap between messages; this only stops the
  // composer from making a request it already knows will be refused.
  const [nextAllowedAt, setNextAllowedAt] = useState(0);

  // Newest thread first, replies oldest first underneath — the way a
  // conversation actually reads.
  const threads = useMemo<Thread[]>(() => {
    const byId = new Map(messages.map((m) => [m.id, m]));
    const repliesBy = new Map<string, ChatMessage[]>();
    const roots: ChatMessage[] = [];
    const orphans: ChatMessage[] = [];

    for (const message of messages) {
      if (!message.parentId) {
        roots.push(message);
      } else if (byId.has(message.parentId)) {
        const list = repliesBy.get(message.parentId) ?? [];
        list.push(message);
        repliesBy.set(message.parentId, list);
      } else {
        // The thread it belonged to was deleted, or has fallen out of the
        // window. Showing it on its own beats dropping it silently.
        orphans.push(message);
      }
    }

    const at = (m: ChatMessage) => toDate(m.createdAt)?.getTime() ?? 0;
    const build = (root: ChatMessage, orphaned: boolean): Thread => ({
      root,
      replies: (repliesBy.get(root.id) ?? []).sort((a, b) => at(a) - at(b)),
      orphaned,
    });

    return [
      ...roots.map((r) => build(r, false)),
      ...orphans.map((r) => build(r, true)),
    ].sort((a, b) => at(b.root) - at(a.root));
  }, [messages]);

  // Being on this page is what counts as having read it. The mark moves
  // to whichever is later — this clock or the newest message's own
  // timestamp — so a server running slightly ahead cannot leave a message
  // permanently unread.
  const uid = profile?.uid;
  useEffect(() => {
    if (!uid) return;
    const newest = messages.reduce(
      (latest, message) => Math.max(latest, toDate(message.createdAt)?.getTime() ?? 0),
      0,
    );
    markChatRead(uid, Math.max(newest, Date.now()));
  }, [uid, messages]);

  async function post(body: string, parentId: string | null) {
    if (!profile) return;
    // Writes the message and the poster's rate-limit counter in one
    // transaction; firestore.rules refuses the message without it.
    await postChatMessage(firestore(), profile.uid, body, parentId);
    setNextAllowedAt(Date.now() + CHAT_MIN_GAP_SECONDS * 1000);
    setReplyTo(null);
  }

  async function remove(id: string) {
    await deleteDoc(doc(firestore(), "chat", id));
  }

  const canDelete = (message: ChatMessage) => isAdmin || message.uid === profile?.uid;

  return (
    <>
      <PageHead title="Chat">
        The league&rsquo;s message board. Everyone approved can read it and post; admins can remove
        anything. Nothing here touches the scoring. There is a {CHAT_MIN_GAP_SECONDS}-second gap
        between messages, so an argument stays an argument rather than a wall.
      </PageHead>

      <Composer
        placeholder="Defend a pick, or explain one away…"
        submitLabel="Post"
        cooldownUntil={nextAllowedAt}
        onSubmit={(body) => post(body, null)}
      />

      {error ? (
        <div className="notice bad" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <Empty>Loading the board…</Empty>
      ) : threads.length === 0 ? (
        <Empty>Nothing has been said yet. Go first.</Empty>
      ) : (
        <div className="stack-sm" style={{ marginTop: 20 }}>
          {threads.map((thread, index) => (
            <Reveal key={thread.root.id} delay={Math.min(index, 5) * 40}>
              <article className="panel chat-thread">
                <Message
                  message={thread.root}
                  author={profileMap.get(thread.root.uid)}
                  you={thread.root.uid === profile?.uid}
                  orphaned={thread.orphaned}
                  onDelete={canDelete(thread.root) ? () => void remove(thread.root.id) : undefined}
                />

                {thread.replies.length > 0 ? (
                  <div className="chat-replies">
                    {thread.replies.map((reply) => (
                      <Message
                        key={reply.id}
                        message={reply}
                        author={profileMap.get(reply.uid)}
                        you={reply.uid === profile?.uid}
                        onDelete={canDelete(reply) ? () => void remove(reply.id) : undefined}
                      />
                    ))}
                  </div>
                ) : null}

                <div className="chat-foot">
                  {replyTo === thread.root.id ? (
                    <Composer
                      compact
                      autoFocus
                      placeholder="Reply…"
                      submitLabel="Reply"
                      cooldownUntil={nextAllowedAt}
                      onCancel={() => setReplyTo(null)}
                      onSubmit={(body) => post(body, thread.root.id)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="quiet small"
                      onClick={() => setReplyTo(thread.root.id)}
                    >
                      Reply
                      {thread.replies.length > 0 ? ` · ${thread.replies.length}` : ""}
                    </button>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}

function Message({
  message,
  author,
  you,
  orphaned,
  onDelete,
}: {
  message: ChatMessage;
  author: Profile | undefined;
  you: boolean;
  orphaned?: boolean;
  onDelete?: () => void;
}) {
  const when = toDate(message.createdAt);

  return (
    <div className="chat-message">
      <Avatar profile={author} />
      <div className="chat-body">
        <div className="chat-meta">
          <span className="chat-author">
            {displayName(author ?? null)}
            {you ? " (you)" : ""}
          </span>
          <time
            className="hint"
            dateTime={when?.toISOString()}
            title={when?.toLocaleString("en-GB")}
          >
            {timeAgo(when)}
          </time>
          {orphaned ? <span className="hint">· reply to a removed message</span> : null}
          {onDelete ? (
            <button type="button" className="quiet small chat-delete" onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </div>
        {/* Rendered as text, never as markup: whatever a player types is
            escaped by React and only line breaks are honoured. */}
        <p className="chat-text">{message.body}</p>
      </div>
    </div>
  );
}

function Composer({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  compact,
  autoFocus,
  cooldownUntil = 0,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
  autoFocus?: boolean;
  /** Epoch ms before which the rules will refuse another message. */
  cooldownUntil?: number;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  // Re-render twice a second while the gap counts down, so the button
  // comes back on its own rather than after the next keystroke.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const waiting = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  const left = MAX_MESSAGE_CHARS - body.length;

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault();
    if (!body.trim() || busy || waiting > 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={compact ? "chat-composer compact" : "chat-composer"}>
      <textarea
        value={body}
        autoFocus={autoFocus}
        rows={compact ? 2 : 3}
        maxLength={MAX_MESSAGE_CHARS}
        placeholder={placeholder}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter breaks the line.
          if (e.key === "Enter" && !e.shiftKey) void submit(e);
        }}
      />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        {left < 200 ? <span className="hint">{left} left</span> : null}
        <span style={{ marginRight: "auto" }} className="hint">
          {waiting > 0
            ? `Another message in ${waiting}s`
            : "Enter sends · Shift+Enter for a new line"}
        </span>
        {onCancel ? (
          <button type="button" className="quiet small" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          className="primary small"
          disabled={busy || !body.trim() || waiting > 0}
        >
          {busy ? "Posting…" : submitLabel}
        </button>
      </div>
      {error ? <div className="notice bad">{error}</div> : null}
    </form>
  );
}
