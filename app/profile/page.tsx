"use client";

import { useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { Avatar, Empty, Footer, PageHead, Panel, RequirePlayer, Value } from "@/components/ui";
import { firestore } from "@/lib/firebase/client";
import { useLeagueBase, useRoundBundles } from "@/lib/hooks";
import { buildSeason, scoreRound } from "@/lib/scoring";
import { displayName } from "@/lib/format";
import type { ScoredEntry } from "@/lib/types";

const EMOJI = [
  "📈", "📉", "🦊", "🐻", "🐂", "🚀", "🧊", "🎲", "🦅", "🐺",
  "🦉", "🐙", "🦁", "🐝", "🌪", "⚡️", "🔥", "🎯", "🛡", "⚓️",
  "🧭", "🪓", "🏔", "🌲", "🍀", "☕️", "🧀", "🎣", "⛷", "🏒",
  "👑", "💀", "🤖", "👽", "🕶", "🎩", "🧶", "🪙", "🏆", "🧠",
];

const COLORS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function ProfilePage() {
  return (
    <RequirePlayer>
      <ProfileEditor />
    </RequirePlayer>
  );
}

function ProfileEditor() {
  const { profile } = useAuth();
  const { profiles, rounds, loading } = useLeagueBase(true);

  const [alias, setAlias] = useState(profile?.alias ?? "");
  const [motto, setMotto] = useState(profile?.motto ?? "");
  const [emoji, setEmoji] = useState(profile?.emoji ?? "📈");
  const [color, setColor] = useState(profile?.color ?? 1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "good" | "bad"; text: string } | null>(null);

  const settledIds = useMemo(
    () => rounds.filter((r) => r.status === "settled").map((r) => r.id),
    [rounds],
  );
  const { bundles } = useRoundBundles(settledIds, settledIds.length > 0);

  const mine = useMemo(() => {
    const scored = new Map<string, ScoredEntry[]>();
    for (const round of rounds) {
      const bundle = bundles.get(round.id);
      if (bundle) scored.set(round.id, scoreRound(round, bundle.pickDocs, bundle.prices));
    }
    const season = buildSeason(rounds, scored, profiles.map((p) => p.uid));
    return season.find((row) => row.uid === profile?.uid) ?? null;
  }, [rounds, bundles, profiles, profile?.uid]);

  const preview = useMemo(
    () => (profile ? { ...profile, alias, motto, emoji, color } : null),
    [profile, alias, motto, emoji, color],
  );

  async function save() {
    if (!profile) return;
    setBusy(true);
    setMessage(null);
    try {
      await updateDoc(doc(firestore(), "profiles", profile.uid), {
        alias: alias.trim() ? alias.trim().slice(0, 24) : null,
        motto: motto.trim() ? motto.trim().slice(0, 80) : null,
        emoji,
        color,
      });
      setMessage({ kind: "good", text: "Profile saved." });
    } catch (error) {
      setMessage({
        kind: "bad",
        text: error instanceof Error ? error.message : "Could not save your profile.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !profile) return <Empty>Loading…</Empty>;

  return (
    <>
      <PageHead title="Your profile">
        This is how you appear in the table. Nothing here affects scoring.
      </PageHead>

      <div className="grid-2">
        <div className="stack-sm">
          <div className="panel">
            <div className="panel-body">
              <div className="row" style={{ gap: 16 }}>
                <Avatar profile={preview} large />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>
                    {displayName(preview)}
                  </div>
                  <div className="secondary" style={{ fontSize: 13 }}>
                    {motto.trim() || "No battle cry yet"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Panel title="Your season">
            {mine && mine.played > 0 ? (
              <div className="stack-sm">
                <Stat label="Points" value={String(mine.points)} />
                <Stat label="Monthly wins" value={String(mine.wins)} />
                <Stat label="Months played" value={String(mine.played)} />
                <Stat label="Average month" node={<Value value={mine.average} />} />
                <Stat label="Compounded" node={<Value value={mine.cumulative} />} />
              </div>
            ) : (
              <p className="hint">Your numbers appear after your first settled month.</p>
            )}
          </Panel>
        </div>

        <Panel title="Appearance">
          <div className="stack-sm">
            <label className="field" htmlFor="alias">
              <span>Display name</span>
              <input
                id="alias"
                value={alias}
                maxLength={24}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={profile.email.split("@")[0]}
              />
            </label>

            <label className="field" htmlFor="motto">
              <span>Battle cry</span>
              <input
                id="motto"
                value={motto}
                maxLength={80}
                onChange={(e) => setMotto(e.target.value)}
                placeholder="Buys tops, sells bottoms"
              />
            </label>

            <div>
              <span className="label" style={{ display: "block", marginBottom: 8 }}>
                Icon
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(40px, 1fr))",
                  gap: 6,
                }}
              >
                {EMOJI.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={option === emoji}
                    onClick={() => setEmoji(option)}
                    style={{
                      height: 38,
                      padding: 0,
                      fontSize: 18,
                      borderColor: option === emoji ? "var(--accent)" : "var(--line-strong)",
                      background: option === emoji ? "var(--accent-soft)" : "var(--surface)",
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="label" style={{ display: "block", marginBottom: 8 }}>
                Colour
              </span>
              <div className="row" style={{ gap: 8 }}>
                {COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={`Colour ${option}`}
                    aria-pressed={option === color}
                    className={`avatar c${option}`}
                    onClick={() => setColor(option)}
                    style={{
                      width: 32,
                      height: 32,
                      padding: 0,
                      borderRadius: "50%",
                      border: option === color ? "2px solid var(--ink)" : "1px solid var(--line-strong)",
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
                {busy ? "Saving…" : "Save profile"}
              </button>
              <span className="hint">Signed in as {profile.email}</span>
            </div>

            {message ? <div className={`notice ${message.kind}`}>{message.text}</div> : null}
          </div>
        </Panel>
      </div>

      <Footer />
    </>
  );
}

function Stat({ label, value, node }: { label: string; value?: string; node?: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="label">{label}</span>
      {node ?? <span className="value">{value}</span>}
    </div>
  );
}
