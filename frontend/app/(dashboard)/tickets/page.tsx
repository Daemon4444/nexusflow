"use client";

import { useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import UserLayout from "@/components/UserLayout";
import { useI18n } from "@/lib/i18n";

interface Ticket {
  id: string;
  user_id: string;
  type: string;
  subject: string;
  description: string;
  model: string | null;
  requested_qpm: number | null;
  requested_tpm: number | null;
  status: string;
  admin_reply: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function TicketsPage() {
  const { t, locale } = useI18n();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [requestedQpm, setRequestedQpm] = useState("");
  const [requestedTpm, setRequestedTpm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    loadTickets(controller.signal);
    return () => controller.abort();
  }, []);

  async function loadTickets(signal?: AbortSignal) {
    try {
      const res = await fetchAPI("/api/tickets", { headers: authHeaders(), signal });
      if (res.success) setTickets(res.data);
    } catch {
      console.error("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }

  async function submitTicket() {
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetchAPI("/api/tickets", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          type: "rate_limit",
          subject: subject.trim(),
          description: description.trim(),
          model: model.trim() || undefined,
          requestedQpm: requestedQpm ? Number(requestedQpm) : undefined,
          requestedTpm: requestedTpm ? Number(requestedTpm) : undefined,
        }),
      });
      if (res.success) {
        setSubject("");
        setDescription("");
        setModel("");
        setRequestedQpm("");
        setRequestedTpm("");
        setShowForm(false);
        await loadTickets();
      }
    } catch {
      console.error("Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  }

  function statusLabel(status: string) {
    switch (status) {
      case "open": return t("statusOpen");
      case "in_progress": return t("statusInProgress");
      case "resolved": return t("statusResolved");
      case "rejected": return t("statusRejected");
      default: return status;
    }
  }

  function statusColor(status: string) {
    switch (status) {
      case "open": return "#f59e0b";
      case "in_progress": return "#3b82f6";
      case "resolved": return "#10b981";
      case "rejected": return "#ef4444";
      default: return "var(--text-tertiary)";
    }
  }

  function formatDate(dateStr: string) {
    const loc = locale === "zh" ? "zh-CN" : "en-US";
    return new Date(dateStr).toLocaleString(loc, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <UserLayout>
      <div className="usr-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>{t("ticketsTitle")}</h1>
          <p>{t("ticketsDesc")}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t("newTicket")}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="usr-section animate-fadeIn" style={{ marginBottom: 20 }}>
          <div className="usr-section-header">
            <h3>{t("newTicket")}</h3>
            <button
              onClick={() => setShowForm(false)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-tertiary)", fontSize: 18, lineHeight: 1 }}
            >
              x
            </button>
          </div>
          <div className="usr-section-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  {t("ticketSubject")}
                </label>
                <input
                  className="input"
                  placeholder={t("ticketSubjectPlaceholder")}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitTicket()}
                  style={{ fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  {t("ticketDesc")}
                </label>
                <textarea
                  className="input"
                  placeholder={t("ticketDescPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  style={{ fontSize: 13, resize: "vertical" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    {t("targetModel")}
                  </label>
                  <input
                    className="input"
                    placeholder={t("targetModelPlaceholder")}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    {t("requestedQpm")}
                  </label>
                  <input
                    className="input"
                    type="number"
                    placeholder="2000"
                    value={requestedQpm}
                    onChange={(e) => setRequestedQpm(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    {t("requestedTpm")}
                  </label>
                  <input
                    className="input"
                    type="number"
                    placeholder="2000000"
                    value={requestedTpm}
                    onChange={(e) => setRequestedTpm(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn-secondary" onClick={() => setShowForm(false)} style={{ fontSize: 13 }}>
                  {t("cancel")}
                </button>
                <button className="btn-primary" onClick={submitTicket} disabled={submitting || !subject.trim() || !description.trim()} style={{ fontSize: 13 }}>
                  {submitting ? t("processing") : t("submitTicket")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tickets list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-tertiary)" }}>{t("loading")}</div>
      ) : tickets.length === 0 ? (
        <div className="usr-section" style={{ textAlign: "center", padding: 60 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{ marginBottom: 12 }}>
            <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 0 0-2 2v3a2 2 0 1 0 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 1 0 0-4V7a2 2 0 0 0-2-2H5z" />
          </svg>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
            {t("noTickets")}
          </p>
          <button className="btn-primary" onClick={() => setShowForm(true)} style={{ fontSize: 13 }}>
            {t("createTicket")}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tickets.map((ticket) => (
            <div key={ticket.id} className="usr-section animate-fadeIn">
              <div style={{ padding: "14px 20px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {ticket.subject}
                    </span>
                    <span style={{ marginLeft: 10, fontSize: 11, color: "var(--text-tertiary)" }}>
                      {formatDate(ticket.created_at)}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                    background: `${statusColor(ticket.status)}15`,
                    color: statusColor(ticket.status),
                  }}>
                    {statusLabel(ticket.status)}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 8 }}>
                  {ticket.description}
                </p>
                {(ticket.model || ticket.requested_qpm || ticket.requested_tpm) && (
                  <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: ticket.admin_reply ? 10 : 0 }}>
                    {ticket.model && <span>{t("modelSpecific")}: {ticket.model}</span>}
                    {ticket.requested_qpm && <span>{t("requestedQpm")}: {ticket.requested_qpm.toLocaleString()}</span>}
                    {ticket.requested_tpm && <span>{t("requestedTpm")}: {ticket.requested_tpm.toLocaleString()}</span>}
                  </div>
                )}
                {ticket.admin_reply && (
                  <div style={{
                    marginTop: 10, padding: "10px 14px",
                    background: "rgba(16, 185, 129, 0.04)",
                    border: "1px solid rgba(16, 185, 129, 0.1)",
                    borderRadius: 8,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#059669", marginBottom: 4 }}>
                      {t("adminReply")}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {ticket.admin_reply}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </UserLayout>
  );
}
