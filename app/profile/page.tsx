"use client";

import { useMemo, useRef, useState } from "react";
import { deleteField, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { Avatar, Empty, PageHead, Panel, RequirePlayer, Reveal, Value } from "@/components/ui";
import { firestore } from "@/lib/firebase/client";
import { useRoundBundles } from "@/lib/hooks";
import { useLeagueBase } from "@/components/LeagueProvider";
import { buildSeason, roundPhase, scoreRound } from "@/lib/scoring";
import { displayName, formatPercent, monthLabel } from "@/lib/format";
import { PhotoCropper } from "@/components/PhotoCropper";
import {
  MAX_ALIAS_CHARS,
  MAX_DESCRIPTION_CHARS,
  profileDescription,
  profileIcon,
  type Round,
  type ScoredEntry,
} from "@/lib/types";

const ICONS = [
  "📈", "📉", "🦊", "🐻", "🐂", "🚀", "🧊", "🎲", "🦅", "🐺",
  "🦉", "🐙", "🦁", "🐝", "🌪", "⚡️", "🔥", "🎯", "🛡", "⚓️",
  "🧭", "🪓", "🏔", "🌲", "🍀", "☕️", "🧀", "🎣", "⛷", "🏒",
  "👑", "💀", "🤖", "👽", "🕶", "🎩", "🧶", "🪙", "🏆", "🧠",
];

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic"];


export default function ProfilePage() {
  return (
    <RequirePlayer>
      <ProfileEditor />
    </RequirePlayer>
  );
}

function ProfileEditor() {
  const { user, profile } = useAuth();
  const { profiles, rounds, loading } = useLeagueBase();

  const [alias, setAlias] = useState(profile?.alias ?? "");
  const [description, setDescription] = useState(profileDescription(profile));
  const [icon, setIcon] = useState(profileIcon(profile) || "📈");
  // The file waiting to be cropped, if any.
  const [pending, setPending] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile?.photoUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "good" | "bad"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Every month that is no longer taking picks, newest first.
   *
   * Not just the settled ones: a month that has locked is already public,
   * and the running one is exactly the month a player most wants to look
   * back at. A month still open is excluded because the rules refuse a
   * listing of its picks — that is the seal, and it applies to your own
   * page too.
   */
  const pastRounds = useMemo(
    () => rounds.filter((r) => roundPhase(r) !== "open").sort((a, b) => b.id.localeCompare(a.id)),
    [rounds],
  );
  const pastIds = useMemo(() => pastRounds.map((r) => r.id), [pastRounds]);
  const { bundles } = useRoundBundles(pastIds, pastIds.length > 0);

  const scored = useMemo(() => {
    const map = new Map<string, ScoredEntry[]>();
    for (const round of rounds) {
      const bundle = bundles.get(round.id);
      if (bundle) map.set(round.id, scoreRound(round, bundle.pickDocs, bundle.prices));
    }
    return map;
  }, [rounds, bundles]);

  const mine = useMemo(() => {
    // buildSeason counts settled months only, so the unsettled ones above
    // add nothing to these figures.
    const season = buildSeason(rounds, scored, profiles.map((p) => p.uid));
    return season.find((row) => row.uid === profile?.uid) ?? null;
  }, [rounds, scored, profiles, profile?.uid]);

  const myMonths = useMemo<MyMonth[]>(() => {
    if (!profile) return [];
    const months: MyMonth[] = [];
    for (const round of pastRounds) {
      const entries = scored.get(round.id) ?? [];
      const entry = entries.find((e) => e.uid === profile.uid);
      if (entry) months.push({ round, entry, field: entries.length });
    }
    return months;
  }, [pastRounds, scored, profile]);

  const preview = useMemo(
    () => (profile ? { ...profile, alias, description, icon, photoUrl } : null),
    [profile, alias, description, icon, photoUrl],
  );

  /**
   * Choosing a file no longer saves a crop; it opens one. The centre of a
   * photograph is rarely the part of it you want in a circle.
   */
  function pickPhoto(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    if (file.type && !ACCEPTED.includes(file.type)) {
      setMessage({ kind: "bad", text: "That is not an image file." });
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setPending(file);
  }

  function closeCropper() {
    setPending(null);
    // Lets the same file be chosen again after a cancel or a failure.
    if (fileInput.current) fileInput.current.value = "";
  }

  async function save() {
    if (!profile) return;
    setBusy(true);
    setMessage(null);
    try {
      await updateDoc(doc(firestore(), "profiles", profile.uid), {
        alias: alias.trim() ? alias.trim().slice(0, MAX_ALIAS_CHARS) : null,
        description: description.trim()
          ? description.trim().slice(0, MAX_DESCRIPTION_CHARS)
          : null,
        icon,
        photoUrl,
        // Written by earlier versions. Removed on save so a profile does
        // not carry two names for the same thing forever.
        motto: deleteField(),
        emoji: deleteField(),
        color: deleteField(),
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

      <Reveal className="grid-2">
        <div className="stack-sm">
          <div className="panel">
            <div className="panel-body">
              <div className="row" style={{ gap: 18 }}>
                <Avatar profile={preview} size="xl" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>
                    {displayName(preview)}
                  </div>
                  <div className="secondary" style={{ fontSize: 13 }}>
                    {description.trim() || "No description yet"}
                  </div>

                  <div className="row" style={{ gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      className="small"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                    >
                      {photoUrl ? "Change picture" : "Upload picture"}
                    </button>
                    {photoUrl ? (
                      <button
                        type="button"
                        className="small quiet"
                        disabled={busy}
                        onClick={() => setPhotoUrl(null)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => void pickPhoto(e.target.files?.[0])}
                  />
                </div>
              </div>

              {pending ? (
                <div style={{ marginTop: 16 }}>
                  <PhotoCropper
                    file={pending}
                    onCancel={closeCropper}
                    onDone={(url) => {
                      setPhotoUrl(url);
                      closeCropper();
                      setMessage({ kind: "good", text: "Picture ready — save to keep it." });
                    }}
                  />
                </div>
              ) : (
                <p className="hint" style={{ marginTop: 14 }}>
                  The picture is cropped and scaled down in your browser, and nothing but the
                  small copy ever leaves your device. Everyone in the league can see it.
                </p>
              )}
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
                maxLength={MAX_ALIAS_CHARS}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={profile.handle}
              />
            </label>

            <label className="field" htmlFor="description">
              <span>Description</span>
              <textarea
                id="description"
                rows={2}
                value={description}
                maxLength={MAX_DESCRIPTION_CHARS}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Buys tops, sells bottoms"
              />
              <span className="hint">
                {MAX_DESCRIPTION_CHARS - description.length} characters left
              </span>
            </label>

            <div>
              <span className="label" style={{ display: "block", marginBottom: 8 }}>
                Status badge
              </span>
              {/* Not the avatar any more — a small mark in the corner of
                  it, so it sits alongside a photo rather than instead of
                  one. Choosing none leaves the corner clean. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(40px, 1fr))",
                  gap: 6,
                }}
              >
                <button
                  type="button"
                  aria-pressed={icon === ""}
                  aria-label="No badge"
                  onClick={() => setIcon("")}
                  style={{
                    height: 38,
                    padding: 0,
                    fontSize: 12,
                    color: "var(--ink-3)",
                    borderColor: icon === "" ? "var(--accent)" : "var(--line-strong)",
                    background: icon === "" ? "var(--accent-soft)" : "var(--surface)",
                  }}
                >
                  None
                </button>
                {ICONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={option === icon}
                    onClick={() => setIcon(option)}
                    style={{
                      height: 38,
                      padding: 0,
                      fontSize: 18,
                      borderColor: option === icon ? "var(--accent)" : "var(--line-strong)",
                      background: option === icon ? "var(--accent-soft)" : "var(--surface)",
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
                {busy ? "Saving…" : "Save profile"}
              </button>
              {/* From the auth session, not the profile document — the
                  address is not stored there any more, and this browser
                  is the only one entitled to see it. */}
              <span className="hint">Signed in as {user?.email}</span>
            </div>

            {message ? <div className={`notice ${message.kind}`}>{message.text}</div> : null}
          </div>
        </Panel>
      </Reveal>

      <Reveal delay={80}>
        <section className="panel" style={{ marginTop: 20 }}>
          <header>
            <h2>Your months</h2>
            <span className="grow" />
            {myMonths.length > 0 ? (
              <span className="hint">
                {myMonths.length} {myMonths.length === 1 ? "month" : "months"} played
              </span>
            ) : null}
          </header>
          <div className="panel-body flush table-scroll">
            {myMonths.length === 0 ? (
              <Empty>
                Nothing yet. Your picks appear here once the month they belong to has locked.
              </Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Your picks</th>
                    <th className="right">Return</th>
                    <th className="center">Finish</th>
                    <th className="right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {myMonths.map(({ round, entry, field }) => (
                    <tr key={round.id}>
                      <td>
                        <strong>{monthLabel(round.id)}</strong>
                        {round.status !== "settled" ? (
                          <div className="hint">still running</div>
                        ) : null}
                      </td>
                      <td>
                        <span className="tickers">
                          {entry.picks.map((pick) => (
                            <span key={pick.instrumentId} className="ticker" title={pick.name}>
                              <strong>{pick.symbol}</strong>
                              <span
                                className={`delta ${
                                  pick.ret === null ? "" : pick.ret >= 0 ? "up" : "down"
                                }`}
                              >
                                {formatPercent(pick.ret)}
                              </span>
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="right">
                        <Value value={entry.ret} precise />
                        {entry.priced < entry.total ? (
                          <div className="hint">
                            {entry.priced}/{entry.total} priced
                          </div>
                        ) : null}
                      </td>
                      <td className="center mono">
                        {entry.rank === null ? "–" : `${entry.rank} of ${field}`}
                      </td>
                      <td className="right">
                        <span className="value">{entry.points ?? "–"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </Reveal>
    </>
  );
}

/** One row of the months table: the month, your entry in it, and how many entered. */
type MyMonth = { round: Round; entry: ScoredEntry; field: number };

function Stat({ label, value, node }: { label: string; value?: string; node?: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="label">{label}</span>
      {node ?? <span className="value">{value}</span>}
    </div>
  );
}
