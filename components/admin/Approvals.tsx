"use client";

import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { Empty, PlayerCell } from "@/components/ui";
import type { Profile, ProfileStatus } from "@/lib/types";

export function Approvals({ profiles, meUid }: { profiles: Profile[]; meUid: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = profiles.filter((p) => p.status === "pending");
  const others = profiles
    .filter((p) => p.status !== "pending")
    .sort((a, b) => a.status.localeCompare(b.status) || (a.email ?? "").localeCompare(b.email ?? ""));

  async function setStatus(uid: string, status: ProfileStatus) {
    setBusy(uid);
    setError(null);
    try {
      await updateDoc(doc(firestore(), "profiles", uid), {
        status,
        approvedAt: status === "approved" ? serverTimestamp() : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that player.");
    } finally {
      setBusy(null);
    }
  }

  async function setAdmin(uid: string, isAdmin: boolean) {
    setBusy(uid);
    setError(null);
    try {
      await updateDoc(doc(firestore(), "profiles", uid), { isAdmin });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change admin rights.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <header>
        <h2>Players</h2>
        <span className="grow" />
        {pending.length > 0 ? <span className="pill warn">{pending.length} waiting</span> : null}
      </header>

      <div className="panel-body flush">
        {pending.length === 0 ? (
          <div style={{ padding: "14px 18px" }} className="hint">
            No one is waiting for approval.
          </div>
        ) : (
          pending.map((p) => (
            <div
              key={p.uid}
              className="row"
              style={{
                justifyContent: "space-between",
                padding: "12px 18px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div>
                <PlayerCell profile={p} />
                <span className="hint">{p.email}</span>
              </div>
              <span className="row">
                <button
                  type="button"
                  className="primary small"
                  disabled={busy === p.uid}
                  onClick={() => void setStatus(p.uid, "approved")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="small danger"
                  disabled={busy === p.uid}
                  onClick={() => void setStatus(p.uid, "rejected")}
                >
                  Reject
                </button>
              </span>
            </div>
          ))
        )}

        {others.length === 0 ? (
          <Empty>No players yet.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {others.map((p) => (
                  <tr key={p.uid}>
                    <td>
                      <PlayerCell profile={p} you={p.uid === meUid} />
                    </td>
                    <td className="hint">{p.email}</td>
                    <td>
                      <span className={`pill ${p.status === "approved" ? "open" : ""}`}>
                        {p.status}
                        {p.isAdmin ? " · admin" : ""}
                      </span>
                    </td>
                    <td className="right">
                      <span className="row" style={{ justifyContent: "flex-end" }}>
                        {p.status === "approved" ? (
                          <button
                            type="button"
                            className="small danger"
                            disabled={busy === p.uid || p.uid === meUid}
                            onClick={() => void setStatus(p.uid, "rejected")}
                          >
                            Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="small"
                            disabled={busy === p.uid}
                            onClick={() => void setStatus(p.uid, "approved")}
                          >
                            Approve
                          </button>
                        )}
                        <button
                          type="button"
                          className="small quiet"
                          disabled={busy === p.uid || p.uid === meUid}
                          onClick={() => void setAdmin(p.uid, !p.isAdmin)}
                        >
                          {p.isAdmin ? "Revoke admin" : "Make admin"}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error ? (
          <div className="notice bad" style={{ margin: 18 }}>
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}
