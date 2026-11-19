import React, { useEffect, useState } from 'react';
import { Flag, X } from 'lucide-react';
import {
  type Confession,
  REPORT_REASONS,
  type ReportReason,
  type UserProfile,
  VALIDATION_LIMITS,
} from '../types';
import { submitReport } from '../lib/firestoreService';

interface ReportModalProps {
  confession: Confession;
  reporterProfile: UserProfile;
  autoQuarantineFlags: number;
  minRepToReport: number;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ReportModal({
  confession,
  reporterProfile,
  autoQuarantineFlags,
  minRepToReport,
  onClose,
  onSubmitted,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const canReport =
    reporterProfile.role !== 'member' || reporterProfile.reputation >= minRepToReport;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canReport) return;
    setError(null);
    setSubmitting(true);
    try {
      await submitReport({
        confession,
        reporterProfile,
        reason,
        details,
        autoQuarantineFlags,
      });
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#141414] border border-[#E6E6E6] dark:border-[#262626] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E6E6] dark:border-[#262626]">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-[#CC0000]" />
            <h2
              id="report-modal-title"
              className="text-lg font-bold text-[#0C0C0C] dark:text-[#F2F2F2]"
            >
              Flag post
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close flag dialog"
            className="p-1.5 rounded-md text-[#595959] hover:text-[#0C0C0C] dark:text-[#A3A3A3] dark:hover:text-[#F2F2F2] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-xs text-[#595959] dark:text-[#A3A3A3] leading-relaxed">
            Posts with{' '}
            <span className="tabular-nums font-semibold text-[#0C0C0C] dark:text-[#F2F2F2]">
              {autoQuarantineFlags}
            </span>{' '}
            flags are automatically hidden until reviewed.
          </div>

          {!canReport && (
            <div className="p-3 rounded-md border border-[#FDE68A] dark:border-[#92400E] bg-[#FFFBEB] dark:bg-[#291F0E] text-xs text-[#92400E] dark:text-[#FDE68A]">
              You need at least{' '}
              <span className="tabular-nums font-semibold">{minRepToReport}</span> rep to flag posts (you have{' '}
              <span className="tabular-nums font-semibold">{reporterProfile.reputation}</span>).
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md border border-[#FECACA] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#2A1215] text-xs text-[#991B1B] dark:text-[#FCA5A5]">
              {error}
            </div>
          )}

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-[#595959] dark:text-[#A3A3A3] mb-1.5">
              Reason
            </legend>
            {REPORT_REASONS.map((item) => (
              <label
                key={item.value}
                className={`flex items-start gap-2.5 p-2.5 rounded-md border transition-colors cursor-pointer ${
                  reason === item.value
                    ? 'border-[#CC0000] bg-[#CC0000]/5 dark:bg-[#CC0000]/10'
                    : 'border-[#E6E6E6] dark:border-[#262626] hover:bg-[#F7F7F7] dark:hover:bg-[#1A1A1A]'
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={item.value}
                  checked={reason === item.value}
                  onChange={() => setReason(item.value)}
                  className="mt-0.5 accent-[#CC0000]"
                />
                <span>
                  <span className="block text-sm font-semibold text-[#0C0C0C] dark:text-[#F2F2F2]">
                    {item.label}
                  </span>
                  <span className="block text-xs text-[#595959] dark:text-[#A3A3A3]">
                    {item.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div>
            <label
              htmlFor="report-details"
              className="block text-xs font-semibold text-[#595959] dark:text-[#A3A3A3] mb-1"
            >
              Note (optional)
            </label>
            <textarea
              id="report-details"
              rows={2}
              maxLength={VALIDATION_LIMITS.reportDetailsMax}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything moderators should know..."
              className="w-full px-3 py-2 text-sm rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C] text-[#0C0C0C] dark:text-[#F2F2F2] focus:outline-none focus:bg-white dark:focus:bg-[#141414] focus:ring-2 focus:ring-[#CC0000]/30"
            />
          </div>

          <div className="pt-3 border-t border-[#E6E6E6] dark:border-[#262626] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !canReport}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-[#CC0000] text-white hover:bg-[#A80000] disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {submitting ? 'Submitting...' : 'Submit flag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
