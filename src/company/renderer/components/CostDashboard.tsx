import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../../renderer/stores';

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// ─── CostBar ──────────────────────────────────────────────────────────────────

interface CostBarProps {
  label: string;
  cost: number;
  maxCost: number;
  isLead?: boolean;
}

function CostBar({ label, cost, maxCost }: CostBarProps) {
  const pct = maxCost > 0 ? Math.min((cost / maxCost) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="text-[9px] font-mono truncate w-28 shrink-0"
        style={{ color: 'var(--text-sub)' }}
        title={label}
      >
        {label}
      </span>
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ height: 4, backgroundColor: 'var(--bg-overlay)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: pct > 80 ? 'var(--accent-red)' : pct > 50 ? 'var(--accent-yellow)' : 'var(--accent-blue)',
          }}
        />
      </div>
      <span
        className="text-[9px] font-mono tabular-nums w-12 text-right shrink-0"
        style={{ color: 'var(--text-main)' }}
      >
        {formatCost(cost)}
      </span>
    </div>
  );
}

// ─── DeptCostSection ──────────────────────────────────────────────────────────

interface DeptCostEntry {
  deptName: string;
  deptTotal: number;
  members: { id: string; name: string; preset: string; cost: number; isLead: boolean }[];
}

// ─── CostDashboard ────────────────────────────────────────────────────────────

export default function CostDashboard() {
  const company = useStore((s) => s.company);
  const memberCosts = useStore((s) => s.memberCosts);
  const sessionStartTime = useStore((s) => s.sessionStartTime);
  const resetCosts = useStore((s) => s.resetCosts);

  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Tick every second to update elapsed time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const toggleDept = useCallback((deptId: string) => {
    setExpanded((prev) => ({ ...prev, [deptId]: !prev[deptId] }));
  }, []);

  if (!company) return null;

  // Aggregate totals
  const totalCost = Object.values(memberCosts).reduce((s, v) => s + v, 0);
  const elapsedMs = sessionStartTime ? now - sessionStartTime : 0;
  const elapsedMinutes = elapsedMs / 60_000;
  const ratePerMin = elapsedMinutes > 0 ? totalCost / elapsedMinutes : 0;

  // Build per-dept cost breakdown
  const deptEntries: DeptCostEntry[] = company.departments.map((dept) => {
    const members = dept.members.map((m) => ({
      id: m.id,
      name: m.name,
      preset: m.preset,
      cost: memberCosts[m.id] ?? 0,
      isLead: m.id === dept.leadId,
    }));
    const deptTotal = members.reduce((s, m) => s + m.cost, 0);
    return { deptName: dept.name, deptTotal, members };
  });

  const maxDeptCost = Math.max(...deptEntries.map((d) => d.deptTotal), 0.001);
  const maxMemberCost = Math.max(...deptEntries.flatMap((d) => d.members.map((m) => m.cost)), 0.001);

  return (
    <div
      className="flex flex-col gap-3 p-3 rounded-lg"
      style={{ backgroundColor: 'var(--bg-mantle)', border: '1px solid var(--bg-surface)' }}
    >
      {/* ── Header row ── */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Cost Dashboard
        </span>
        <button
          onClick={resetCosts}
          className="text-[8px] font-mono px-1.5 py-px rounded transition-colors"
          style={{ color: 'var(--text-subtle)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--bg-overlay)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-subtle)'; }}
          title="Reset cost counters and restart session timer"
        >
          Reset
        </button>
      </div>

      {/* ── Summary stats ── */}
      <div
        className="grid grid-cols-3 gap-2 p-2 rounded"
        style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--bg-surface)' }}
      >
        {/* Total cost */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Total
          </span>
          <span className="text-sm font-mono font-bold tabular-nums" style={{ color: 'var(--text-main)' }}>
            {formatCost(totalCost)}
          </span>
        </div>

        {/* Rate / min */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            /min
          </span>
          <span
            className="text-sm font-mono font-bold tabular-nums"
            style={{ color: ratePerMin > 0.05 ? 'var(--accent-red)' : ratePerMin > 0.01 ? 'var(--accent-yellow)' : 'var(--accent-green)' }}
          >
            {ratePerMin < 0.001 ? '$0' : `$${ratePerMin.toFixed(3)}`}
          </span>
        </div>

        {/* Session time */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Time
          </span>
          <span className="text-sm font-mono font-bold tabular-nums" style={{ color: 'var(--text-sub)' }}>
            {formatDuration(elapsedMs)}
          </span>
        </div>
      </div>

      {/* ── Department breakdown ── */}
      {deptEntries.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            By Department
          </span>

          {deptEntries.map((entry) => (
            <div key={entry.deptName} className="flex flex-col gap-0.5">
              {/* Dept row — clickable to expand members */}
              <button
                className="w-full text-left flex items-center gap-1 py-0.5 group"
                onClick={() => toggleDept(entry.deptName)}
              >
                <span
                  className="text-[8px] font-mono shrink-0 transition-transform"
                  style={{
                    color: 'var(--text-muted)',
                    display: 'inline-block',
                    transform: expanded[entry.deptName] ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                >
                  {'\u25B6'}
                </span>
                <CostBar
                  label={entry.deptName}
                  cost={entry.deptTotal}
                  maxCost={maxDeptCost}
                />
              </button>

              {/* Member breakdown (expanded) */}
              {expanded[entry.deptName] && (
                <div className="pl-4 flex flex-col gap-0.5 pb-1">
                  {entry.members
                    .slice()
                    .sort((a, b) => b.cost - a.cost)
                    .map((m) => (
                      <div key={m.id} className="flex items-center gap-1">
                        {m.isLead && (
                          <span className="text-[7px] shrink-0" style={{ color: 'var(--accent-yellow)' }}>
                            {'\u2605'}
                          </span>
                        )}
                        {!m.isLead && <span className="w-2 shrink-0" />}
                        <CostBar
                          label={m.name}
                          cost={m.cost}
                          maxCost={maxMemberCost}
                          isLead={m.isLead}
                        />
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {totalCost === 0 && (
        <p className="text-center text-[9px] font-mono py-1" style={{ color: 'var(--text-subtle)' }}>
          No cost data yet. Costs update as agents run.
        </p>
      )}
    </div>
  );
}
