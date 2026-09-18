"use client";

import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { Avatar, Empty, PageHead, RequirePlayer, Reveal } from "@/components/ui";
import { firestore } from "@/lib/firebase/client";
import { useChat, useLeagueBase } from "@/lib/hooks";
import { displayName, timeAgo } from "@/lib/format";
import { MAX_MESSAGE_CHARS, toDate, type ChatMessage, type Profile } from "@/lib/types";

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

  async function post(body: string, parentId: string | null) {
    if (!profile) return;
    await addDoc(collection(firestore(), "chat"), {
      uid: profile.uid,
      body: body.trim().slice(0, MAX_MESSAGE_CHARS),
      parentId,
      createdAt: serverTimestamp(),
    });
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
        anything. Nothing here touches the scoring.
      </PageHead>

      <Composer
        placeholder="Defend a pick, or explain one away…"
        submitLabel="Post"
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
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const left = MAX_MESSAGE_CHARS - body.length;

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault();
    if (!body.trim() || busy) return;
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
          Enter sends · Shift+Enter for a new line
        </span>
        {onCancel ? (
          <button type="button" className="quiet small" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="primary small" disabled={busy || !body.trim()}>
          {busy ? "Posting…" : submitLabel}
        </button>
      </div>
      {error ? <div className="notice bad">{error}</div> : null}
    </form>
  );
}
