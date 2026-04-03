import { useState } from 'react';
import { useStore } from '../../../renderer/stores';
import { spawnCompany, spawnMember } from '../provisioner';
import CreateCompanyDialog, { type CompanyTemplateResult } from './CreateCompanyDialog';
import CompanyMemberItem from './CompanyMemberItem';
import AddMemberDialog from './AddMemberDialog';

/* ── tiny icons ────────────────────────────────────────────────────────────── */

const Ix = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);
const Iplus = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);
const Itrash = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M4.5 3V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M3 3l.5 7a1 1 0 001 1h3a1 1 0 001-1L9 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/* ═══════════════════════════════════════════════════════════════════════════════
   MANAGE VIEW
   ═══════════════════════════════════════════════════════════════════════════════ */

function ManageView({ onClose }: { onClose: () => void }) {
  const company = useStore((s) => s.company);
  const messageQueue = useStore((s) => s.messageQueue);
  const [addingDept, setAddingDept] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  if (!company) return null;

  const total = company.departments.reduce((s, d) => s + d.members.length, 0);
  const prov = company.departments.reduce((s, d) => s + d.members.filter((m) => m.workspaceId && m.ptyId).length, 0);

  const pendingCounts: Record<string, number> = {};
  for (const m of messageQueue) {
    if (!m.delivered) pendingCounts[m.targetMemberId] = (pendingCounts[m.targetMemberId] ?? 0) + 1;
  }

  const handleAddMember = async (deptId: string, deptName: string, name: string, preset: string, customPath?: string) => {
    useStore.getState().addMember(deptId, name, preset as import('../../types').AgentPreset, customPath);
    setAddingTo(null);

    // Spawn the new member immediately
    const dept = useStore.getState().company?.departments.find((d) => d.id === deptId);
    const lead = dept?.members.find((m) => m.id === dept?.leadId);
    const { workspaceId, ptyId } = await spawnMember(
      company.name, deptName, lead?.name || 'Lead', name, preset,
      company.skipPermissions || false, company.workDir,
    );
    const member = useStore.getState().company?.departments.find((d) => d.id === deptId)?.members.find((m) => m.name === name);
    if (member) {
      useStore.getState().setMemberWorkspace(member.id, workspaceId);
      useStore.getState().setMemberPty(member.id, ptyId);
    }
  };

  const handleDestroy = () => {
    if (!confirm('Destroy company and all teams?')) return;
    for (const dept of company.departments) {
      for (const m of dept.members) {
        if (m.ptyId) window.electronAPI.pty.dispose(m.ptyId);
      }
    }
    useStore.getState().destroyCompany();
    onClose();
  };

  return (
    <>
      {/* header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-mono font-bold" style={{ color: 'var(--text-main)' }}>{company.name}</div>
          <div className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {company.departments.length} dept &middot; {prov}/{total} provisioned
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleDestroy}
            className="px-2.5 py-1 rounded text-[10px] font-mono hover:bg-[rgba(243,139,168,0.1)]"
            style={{ color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }}>
            Destroy
          </button>
        </div>
      </div>

      {/* department list */}
      <div className="flex-1 overflow-y-auto -mx-5 px-5 space-y-2" style={{ maxHeight: 380 }}>
        {company.departments.map((dept) => {
          const lead = dept.members.find((m) => m.id === dept.leadId);
          const others = dept.members.filter((m) => m.id !== dept.leadId);
          return (
            <div key={dept.id} className="rounded overflow-hidden"
              style={{ backgroundColor: 'var(--bg-mantle)', border: '1px solid var(--bg-surface)' }}>
              <div className="flex items-center justify-between px-3 py-1.5"
                style={{ borderBottom: '1px solid var(--bg-surface)' }}>
                <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--text-main)' }}>
                  {dept.name}
                  <span className="font-normal ml-1.5" style={{ color: 'var(--text-muted)' }}>{dept.members.length}</span>
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setAddingTo(addingTo === dept.id ? null : dept.id)}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono hover:bg-[rgba(166,227,161,0.08)]"
                    style={{ color: 'var(--accent-green)' }}>
                    <Iplus />add
                  </button>
                  <button onClick={() => useStore.getState().removeDepartment(dept.id)}
                    className="p-0.5 rounded hover:bg-[rgba(243,139,168,0.08)]"
                    style={{ color: 'var(--accent-red)' }}><Itrash /></button>
                </div>
              </div>

              {lead && <CompanyMemberItem member={lead} isLead pendingMessageCount={pendingCounts[lead.id] ?? 0} />}
              {others.map((m) => (
                <CompanyMemberItem key={m.id} member={m} isLead={false} pendingMessageCount={pendingCounts[m.id] ?? 0} />
              ))}

              {addingTo === dept.id && (
                <AddMemberDialog
                  deptName={dept.name}
                  onConfirm={(name, preset, customPath) => handleAddMember(dept.id, dept.name, name, preset, customPath)}
                  onCancel={() => setAddingTo(null)}
                />
              )}
            </div>
          );
        })}

        {addingDept ? (
          <AddDeptRow onAdd={(n, l) => { useStore.getState().addDepartment(n, l); setAddingDept(false); }}
            onCancel={() => setAddingDept(false)} />
        ) : (
          <button onClick={() => setAddingDept(true)}
            className="w-full flex items-center justify-center gap-1.5 py-3 rounded text-[10px] font-mono transition-colors hover:border-[var(--accent-blue)] hover:text-[var(--accent-blue)]"
            style={{ color: 'var(--text-muted)', border: '1px dashed var(--bg-overlay)' }}>
            <Iplus /> Add Department
          </button>
        )}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between pt-3 mt-3 text-[9px] font-mono"
        style={{ borderTop: '1px solid var(--bg-surface)', color: 'var(--text-muted)' }}>
        <span>CEO: {company.ceoWorkspaceId ? 'assigned' : '-'}</span>
        <button onClick={onClose} className="hover:underline" style={{ color: 'var(--accent-blue)' }}>Close</button>
      </div>
    </>
  );
}

/* ── add dept row ──────────────────────────────────────────────────────────── */

function AddDeptRow({ onAdd, onCancel }: { onAdd: (n: string, l: string) => void; onCancel: () => void }) {
  const [n, setN] = useState('');
  const [l, setL] = useState('');
  const ok = !!(n.trim() && l.trim());
  const go = () => { if (ok) onAdd(n.trim(), l.trim()); };
  return (
    <div className="flex items-center gap-1.5 p-2 rounded"
      style={{ backgroundColor: 'var(--bg-mantle)', border: '1px solid var(--bg-surface)' }}>
      <input value={n} onChange={(e) => setN(e.target.value)} placeholder="Dept" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') onCancel(); }}
        className="flex-1 px-2 py-1 rounded text-[10px] font-mono focus:outline-none"
        style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)' }} />
      <input value={l} onChange={(e) => setL(e.target.value)} placeholder="Lead"
        onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') onCancel(); }}
        className="w-24 px-2 py-1 rounded text-[10px] font-mono focus:outline-none"
        style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)' }} />
      <button onClick={go} className="px-2 py-1 rounded text-[9px] font-mono font-bold hover:opacity-90"
        style={{ backgroundColor: 'var(--accent-blue)', color: 'var(--bg-base)', opacity: ok ? 1 : 0.3 }}>Add</button>
      <button onClick={onCancel} style={{ color: 'var(--text-muted)' }}><Ix /></button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ROOT
   ═══════════════════════════════════════════════════════════════════════════════ */

interface CompanyViewProps { onClose: () => void; }

export default function CompanyView({ onClose }: CompanyViewProps) {
  const hasCompany = useStore((s) => s.company !== null);
  const handleConfirm = (result: CompanyTemplateResult) => {
    // 1. Create company synchronously in store
    useStore.getState().createCompany(result.name, result.skipPermissions, result.workDir || undefined);

    // 2. Close dialog first
    onClose();

    // 3. Spawn agents in background (fire-and-forget, detached from component lifecycle)
    spawnCompany({
      companyName: result.name,
      skipPermissions: result.skipPermissions,
      workDir: result.workDir,
      departments: result.template.departments.map((d) => ({
        name: d.name,
        leadName: d.leadName,
        members: d.members.map((m) => ({ name: m.name, preset: m.preset, customAgentPath: m.customAgentPath })),
      })),
    }).catch((err) => console.error('Company spawn error:', err));
  };

  if (!hasCompany) {
    return (
      <CreateCompanyDialog
        onConfirm={handleConfirm}
        onCancel={onClose}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--bg-base)',
          border: '1px solid var(--bg-surface)',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
        }}
      >
        <ManageView onClose={onClose} />
      </div>
    </div>
  );
}
