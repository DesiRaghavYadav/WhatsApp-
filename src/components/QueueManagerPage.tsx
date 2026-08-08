import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  ArrowUp, 
  ArrowDown, 
  Trash2, 
  ChevronUp, 
  Activity, 
  Clock, 
  RefreshCw, 
  AlertCircle, 
  User, 
  Users, 
  Zap, 
  CheckCircle,
  FileText
} from 'lucide-react';

interface QueueManagerPageProps {
  queueItems: any[];
  pausedSessions: string[];
  sessionsList: any[];
  handleTogglePauseSession: (sessionId: string) => Promise<void>;
  handleQueueReorder: (itemId: string, action: 'up' | 'down' | 'top' | 'delete') => Promise<void>;
  globalDelaySecondsState: number;
  handleClearQueue?: (type?: 'pending' | 'history' | 'all') => Promise<void>;
}

export const QueueManagerPage: React.FC<QueueManagerPageProps> = ({
  queueItems,
  pausedSessions,
  sessionsList,
  handleTogglePauseSession,
  handleQueueReorder,
  globalDelaySecondsState,
  handleClearQueue
}) => {
  // Filter queue items by status
  const pendingItems = queueItems.filter(item => item.status === 'pending');
  const activeItems = queueItems.filter(item => item.status === 'sending');
  const pastItems = queueItems.filter(item => item.status === 'completed' || item.status === 'sent' || item.status === 'failed');

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Header banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-500" />
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-400 animate-pulse" />
            <span>Account Queue Management Dashboard</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Independently control, pause, or resume WhatsApp session queues to prevent account overlaps and re-order scheduled tasks.
          </p>
        </div>
      </div>

      {/* 2. Account Queues Controller (Grid) */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <span>Active Session Queues</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessionsList.map((sess) => {
            const isPaused = pausedSessions.includes(sess.id);
            const isConnected = sess.status === 'connected';
            const sessQueuePending = queueItems.filter(item => item.sessionId === sess.id && item.status === 'pending');
            const sessQueueSending = queueItems.filter(item => item.sessionId === sess.id && item.status === 'sending');

            return (
              <div 
                key={sess.id} 
                className={`bg-slate-900/60 border rounded-2xl p-5 shadow-xl relative overflow-hidden transition-all duration-300 ${
                  isPaused 
                    ? 'border-amber-500/30 bg-amber-950/5' 
                    : isConnected 
                      ? 'border-slate-800 hover:border-teal-500/30' 
                      : 'border-slate-800/40 opacity-70'
                }`}
              >
                {/* Visual Status Indicator Strip */}
                <div className={`absolute top-0 left-0 w-1.5 h-full ${
                  isPaused ? 'bg-amber-500' : isConnected ? 'bg-emerald-500' : 'bg-slate-700'
                }`} />

                <div className="flex items-center justify-between mb-4 pl-2">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span className="font-mono">{sess.id.toUpperCase()}</span>
                      {sess.name && <span className="text-xs text-slate-400 font-normal">({sess.name})</span>}
                    </h4>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      {sess.phone || 'No phone connected'}
                    </span>
                  </div>
                  
                  {/* Status Badge */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isPaused 
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25' 
                      : isConnected 
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' 
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    {isPaused ? 'PAUSED' : isConnected ? 'ACTIVE' : 'OFFLINE'}
                  </span>
                </div>

                {/* Queue Stats block */}
                <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-850/60 mb-4 ml-2">
                  <div className="text-left">
                    <span className="text-[10px] text-slate-500 block uppercase">Pending</span>
                    <span className="text-lg font-bold text-white font-mono">{sessQueuePending.length}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-slate-500 block uppercase">In Progress</span>
                    <span className="text-lg font-bold text-teal-400 font-mono flex items-center gap-1">
                      {sessQueueSending.length}
                      {sessQueueSending.length > 0 && <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400" />}
                    </span>
                  </div>
                </div>

                {/* Control Action Buttons */}
                <div className="pl-2">
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => handleTogglePauseSession(sess.id)}
                      className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isPaused 
                          ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 shadow-md shadow-emerald-500/5' 
                          : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-4 h-4 fill-emerald-400/20" />
                          <span>Resume Sending Queue</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-4 h-4 fill-amber-400/20" />
                          <span>Pause Sending Queue</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="w-full text-center py-2 bg-slate-950/40 text-[11px] text-slate-500 rounded-xl border border-slate-850 border-dashed">
                      Account offline. Connect in Dispatch Studio.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Granular Queue Re-ordering Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-500" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-850">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <Zap className="w-4.5 h-4.5 text-teal-400" />
              <span>Prioritize & Re-order Message Queue</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Boost, re-order, or delete individual pending messages or clear entire queue categories.
            </p>
          </div>

          {/* Delete / Clear Queue Action Buttons Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {pendingItems.length > 0 && (
              <button
                type="button"
                onClick={() => handleClearQueue && handleClearQueue('pending')}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Delete all pending messages waiting in queue"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Pending Queue ({pendingItems.length})</span>
              </button>
            )}

            {pastItems.length > 0 && (
              <button
                type="button"
                onClick={() => handleClearQueue && handleClearQueue('history')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Clear completed and failed messages from queue history"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Clear Queue History ({pastItems.length})</span>
              </button>
            )}

            {queueItems.length > 0 && (
              <button
                type="button"
                onClick={() => handleClearQueue && handleClearQueue('all')}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Purge all items from the message queue"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete All Queue ({queueItems.length})</span>
              </button>
            )}
          </div>
        </div>

        {queueItems.length === 0 ? (
          <div className="text-center py-12 bg-slate-950/40 border border-slate-850 border-dashed rounded-2xl">
            <AlertCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Message Queue is Empty</h4>
            <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
              Queue is quiet. Send some messages in Dispatch Studio or Status Broadcast pages to see them line up here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-850 text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                  <th className="py-3 px-4">Priority Sequence</th>
                  <th className="py-3 px-4">Session Account</th>
                  <th className="py-3 px-4">Recipient Target</th>
                  <th className="py-3 px-4">Message / Payload Details</th>
                  <th className="py-3 px-4 text-center">Dispatch Status</th>
                  <th className="py-3 px-4 text-right">Sequence Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60">
                <AnimatePresence initial={false}>
                  {queueItems.map((item, idx) => {
                    const isPending = item.status === 'pending';
                    const isSending = item.status === 'sending';
                    const isCompleted = item.status === 'completed';
                    const isFailed = item.status === 'failed';
                    const isPaused = pausedSessions.includes(item.sessionId);

                    // Find relative index in pending list
                    const pendingIndices = queueItems
                      .map((q, qidx) => (q.status === 'pending' ? qidx : -1))
                      .filter(qidx => qidx !== -1);
                    const pendingPosition = pendingIndices.indexOf(idx);

                    const isFirstPending = pendingPosition === 0;
                    const isLastPending = pendingPosition === pendingIndices.length - 1;

                    return (
                      <motion.tr 
                        key={item.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className={`transition-colors text-xs ${
                          isSending 
                            ? 'bg-teal-500/5' 
                            : isPaused && isPending
                              ? 'bg-amber-500/[0.02]'
                              : 'hover:bg-slate-850/20'
                        }`}
                      >
                        {/* 1. Sequence Priority */}
                        <td className="py-4 px-4 font-mono">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">#{idx + 1}</span>
                            {isSending && (
                              <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 2. Session ID */}
                        <td className="py-4 px-4 font-mono font-bold text-slate-300">
                          <span className="px-2 py-0.5 bg-slate-950 rounded border border-slate-850 text-[10px]">
                            {item.sessionId.toUpperCase()}
                          </span>
                        </td>

                        {/* 3. Recipient */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5 max-w-[160px] truncate">
                            {item.recipientType === 'group' ? (
                              <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            ) : (
                              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <span className="text-white font-semibold block truncate" title={item.recipient}>
                              {item.recipient}
                            </span>
                          </div>
                        </td>

                        {/* 4. Payload / Batch Details */}
                        <td className="py-4 px-4 max-w-[280px]">
                          <div className="space-y-1 text-left">
                            <div className="text-slate-300 truncate max-w-[240px]" title={item.message}>
                              {item.message || <span className="text-slate-500 italic">No text payload</span>}
                            </div>
                            
                            {/* Rich file attachment meta if any */}
                            {item.attachmentType && item.attachmentType !== 'none' && (
                              <div className="flex items-center gap-1 text-[10px] text-teal-400">
                                <FileText className="w-3 h-3" />
                                <span className="font-mono">Media: {item.attachmentType} ({item.attachmentName || 'unnamed'})</span>
                              </div>
                            )}

                            {/* Batch progress inside queue item if group batch */}
                            {item.tagJobId && (
                              <div className="mt-1.5 p-2 bg-emerald-500/5 rounded border border-emerald-500/10 text-[10px] space-y-1">
                                <div className="flex justify-between font-mono">
                                  <span className="text-emerald-400 font-bold">Group Tagging Progress</span>
                                  <span className="text-white">Batch {item.tagJobBatchIndex}/{item.tagJobBatchCount}</span>
                                </div>
                                <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-emerald-500 h-full rounded-full transition-all"
                                    style={{ width: `${Math.round((item.tagJobCompleted / (item.tagJobTotal || 1)) * 100)}%` }}
                                  />
                                </div>
                                <div className="text-slate-400 flex justify-between">
                                  <span>Processed: {item.tagJobCompleted}/{item.tagJobTotal}</span>
                                  <span>ID: {item.tagJobId}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 5. Dispatch Status */}
                        <td className="py-4 px-4 text-center">
                          <div className="inline-flex flex-col items-center">
                            {isSending ? (
                              <span className="px-2.5 py-0.5 bg-teal-500/15 text-teal-400 border border-teal-500/25 rounded-full font-bold uppercase text-[9px] tracking-wider animate-pulse flex items-center gap-1">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                <span>Sending</span>
                              </span>
                            ) : isPaused && isPending ? (
                              <span className="px-2.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded-full font-bold uppercase text-[9px] tracking-wider flex items-center gap-1">
                                <Pause className="w-2.5 h-2.5" />
                                <span>Paused Queue</span>
                              </span>
                            ) : isPending ? (
                              <span className="px-2.5 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/25 rounded-full font-bold uppercase text-[9px] tracking-wider">
                                Pending
                              </span>
                            ) : isCompleted ? (
                              <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-full font-bold uppercase text-[9px] tracking-wider flex items-center gap-1">
                                <CheckCircle className="w-2.5 h-2.5" />
                                <span>Sent</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 bg-rose-500/15 text-rose-400 border border-rose-500/25 rounded-full font-bold uppercase text-[9px] tracking-wider">
                                Failed
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 6. Sequence reordering controls */}
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPending ? (
                              <>
                                {/* Move to Top */}
                                <button
                                  type="button"
                                  onClick={() => handleQueueReorder(item.id, 'top')}
                                  disabled={isFirstPending}
                                  title="Boost to Top Priority"
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isFirstPending
                                      ? 'bg-slate-950/20 text-slate-700 border-slate-900 cursor-not-allowed'
                                      : 'bg-teal-500/5 hover:bg-teal-500/15 text-teal-400 border-teal-500/20'
                                  }`}
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>

                                {/* Move Up */}
                                <button
                                  type="button"
                                  onClick={() => handleQueueReorder(item.id, 'up')}
                                  disabled={isFirstPending}
                                  title="Move Up One Slot"
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isFirstPending
                                      ? 'bg-slate-950/20 text-slate-700 border-slate-900 cursor-not-allowed'
                                      : 'bg-slate-950 hover:bg-slate-850 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>

                                {/* Move Down */}
                                <button
                                  type="button"
                                  onClick={() => handleQueueReorder(item.id, 'down')}
                                  disabled={isLastPending}
                                  title="Move Down One Slot"
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isLastPending
                                      ? 'bg-slate-950/20 text-slate-700 border-slate-900 cursor-not-allowed'
                                      : 'bg-slate-950 hover:bg-slate-850 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>

                                {/* Delete Item */}
                                <button
                                  type="button"
                                  onClick={() => handleQueueReorder(item.id, 'delete')}
                                  title="Remove from Queue"
                                  className="p-1.5 rounded-lg bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 border border-rose-500/20 transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : isSending ? (
                              <span className="text-[10px] font-bold text-teal-400 bg-teal-500/10 px-2 py-1 rounded-md border border-teal-500/20">
                                Dispatching...
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleQueueReorder(item.id, 'delete')}
                                title="Remove from Queue History"
                                className="p-1.5 rounded-lg bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 border border-rose-500/20 transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Record</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
