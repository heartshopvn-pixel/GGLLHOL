/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { PanelRightOpen, Volume2, VolumeX } from 'lucide-react';
import { DevTabId } from './types/game';
import { useClassroomEngine } from './hooks/useClassroomEngine';
import { GameStage } from './components/stage/GameStage';
import { DevStudio } from './components/studio/DevStudio';

export default function App() {
  const isPureStreamMode =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('view') === 'live' ||
      new URLSearchParams(window.location.search).get('mode') === 'live' ||
      new URLSearchParams(window.location.search).get('obs') === '1');

  const [studioOpen, setStudioOpen] = useState(!isPureStreamMode);
  const [activeTab, setActiveTab] = useState<DevTabId>('control');
  const [compactRemoteStage, setCompactRemoteStage] = useState<boolean>(() => {
    if (isPureStreamMode || typeof window === 'undefined') return false;
    return sessionStorage.getItem('chua_compact_remote_stage') === 'true';
  });

  const engine = useClassroomEngine();

  const handleToggleCompactRemoteStage = () => {
    setCompactRemoteStage((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem('chua_compact_remote_stage', next ? 'true' : 'false');
      } catch {
        // Ignore
      }
      return next;
    });
  };

  // Luôn giữ ẩn Sân Khấu 2D khi bật chế độ Thu gọn Sân 2D (compactRemoteStage), kể cả khi chỉnh thẻ Map
  const shouldHideHeavyStage =
    !isPureStreamMode &&
    studioOpen &&
    compactRemoteStage;

  // Keyboard shortcut F2 to toggle Dev Studio for OBS clean capture
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setStudioOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const bState = engine.classBoardState;
  const activeStepLabel =
    bState.engine === 'notice'
      ? '📋 Bảng Thông Báo'
      : bState.phase === 'lesson_start'
      ? 'Luồng 0: Bắt đầu tiết học'
      : bState.phase === 'preparing'
      ? 'Luồng 1: Chuẩn bị (3s)'
      : bState.phase === 'asking'
      ? `Luồng ${bState.lessonStepNumber || 2}: Hỏi bài & Đợi trả lời`
      : bState.phase === 'answer_flash'
      ? 'Luồng 4: Hiện đáp án & Cộng điểm'
      : bState.phase === 'result_summary'
      ? 'Luồng 5: Đọc kết quả & Xếp chỗ'
      : bState.phase === 'ranking_board' || bState.phase === 'reveal'
      ? 'Luồng 6: Bảng xếp hạng trong lớp'
      : bState.phase === 'record_notice'
      ? '🏆 Luồng Kỷ Lục Hôm Nay'
      : '⚠️ Luồng Thông Báo Phạt';

  return (
    <div className="h-screen w-screen flex flex-row items-stretch justify-between bg-stone-950 overflow-hidden relative">
      {/* Minimal Floating Trigger ONLY when Dev Studio is hidden and not in ?obs=1 pure mode */}
      {!studioOpen && !isPureStreamMode && (
        <div className="fixed top-2.5 right-2.5 z-50 flex items-center gap-1 opacity-35 hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={engine.handleToggleLocalMute}
            className="px-2 py-1 rounded-md bg-stone-900/95 border border-stone-700 text-[10px] font-medium text-stone-200 flex items-center gap-1 shadow-lg cursor-pointer"
          >
            {engine.isLocalTabMuted ? (
              <>
                <VolumeX className="w-3 h-3 text-rose-400" />
                <span>Tab tắt tiếng</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3 h-3 text-emerald-400" />
                <span>Tab có tiếng</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="px-2.5 py-1 rounded-md bg-stone-900/95 hover:bg-stone-800 border border-amber-500/40 text-[10px] font-semibold text-amber-300 flex items-center gap-1 shadow-lg cursor-pointer"
          >
            <PanelRightOpen className="w-3 h-3" />
            <span>Mở Studio (F2)</span>
          </button>
        </div>
      )}

      {/* Left Area: 9:16 Stage OR Lightweight Remote Monitor when compactRemoteStage is active */}
      {shouldHideHeavyStage ? (
        <div className="flex-1 h-full bg-stone-950 flex flex-col items-center justify-center p-6 select-none overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-stone-900/90 border border-amber-500/30 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-3">
              <div>
                <div className="text-xs font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  ⚡ Chế độ Remote Siêu Nhẹ (Đã tắt vẽ 2D 60FPS)
                </div>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Giải phóng ~90% GPU/CPU của Chrome để nhường toàn bộ tài nguyên cho TikTok Live Studio
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleCompactRemoteStage}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-extrabold cursor-pointer shrink-0 transition"
              >
                🖥️ Hiện Sân 2D
              </button>
            </div>

            {/* Trạng thái Bảng Lớp trực tiếp */}
            <div className="rounded-xl bg-stone-950/90 border border-stone-800 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-300">{activeStepLabel}</span>
                <span className="font-mono font-bold text-amber-300">
                  {bState.isRunning
                    ? `⏱️ ${Math.ceil((bState.timeLeftMs || 0) / 1000)}s`
                    : '⏸️ Đang tạm dừng'}
                </span>
              </div>
              {bState.currentQuestion && (
                <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-800/80 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] text-stone-400">Câu hỏi hiện tại trên Live:</div>
                    <div className="text-sm font-black text-white">
                      {bState.currentQuestion.vi}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-stone-400">Đáp án chuẩn:</div>
                    <div className="text-sm font-black text-emerald-400 font-mono">
                      {bState.currentQuestion.en}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Trạng thái Giọng Đọc Live */}
            <div className="rounded-xl bg-stone-950/90 border border-stone-800 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-stone-400 font-semibold">🎙️ Giọng đọc trên Live:</span>
                <span
                  className={`font-bold ${
                    engine.eventTtsQueue.isPlayingEvent
                      ? 'text-emerald-400'
                      : 'text-stone-400'
                  }`}
                >
                  {engine.eventTtsQueue.isPlayingEvent
                    ? 'Đang phát giọng đọc'
                    : 'Sẵn sàng'}
                </span>
              </div>
              <div className="text-xs text-stone-200 font-medium line-clamp-2 bg-stone-900/80 p-2 rounded border border-stone-800/60 min-h-[36px]">
                {engine.eventTtsQueue.currentEventText ||
                  'Không có câu đọc nào đang phát'}
              </div>
              <div className="flex items-center justify-between text-[10px] text-stone-400 pt-1">
                <span>
                  Hàng chờ âm thanh: <strong className="text-amber-300">{engine.eventTtsQueue.waitingCount}</strong> câu
                </span>
                <span>
                  Trong lớp: <strong className="text-emerald-300">{engine.realCount + engine.botCount}</strong> • Chờ cửa: <strong className="text-cyan-300">{engine.queueCount}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <GameStage
          config={engine.config}
          vipSlots={engine.vipSlots}
          normalSlots={engine.normalSlots}
          pilgrims={engine.pilgrims}
          specialFlowerRunners={engine.specialFlowerRunners}
          doorCrowd={engine.doorCrowd}
          waitingQueue={engine.waitingQueue}
          queueCount={engine.queueCount}
          monks={engine.monks}
          lotusDonors={engine.lotusDonors}
          dailyRecords={engine.dailyRecords}
          onResetDailyRecords={engine.handleResetDailyRecords}
          floatingToasts={engine.floatingToasts}
          customAssets={engine.customAssets}
          grandEventProgress={engine.grandEventProgress}
          goldenLotusRainUntil={engine.goldenLotusRainUntil}
          moneyRainUntil={engine.moneyRainUntil}
          runningPigs={engine.runningPigs}
          roamingCats={engine.roamingCats}
          flyingFlowers={engine.flyingFlowers}
          simpleExplosions={engine.simpleExplosions}
          zombieEventState={engine.zombieEventState}
          zombieEntity={engine.zombieEntity}
          zombieProjectiles={engine.zombieProjectiles}
          zombieSpikyDamages={engine.zombieSpikyDamages}
          flyingMilkTeas={engine.flyingMilkTeas}
          latestAltarOffering={engine.latestAltarOffering}
          burnerLotusBursts={engine.burnerLotusBursts}
          flyingLotuses={engine.flyingLotuses}
          eventBarFlashKey={engine.eventBarFlashKey}
          cameraFocus={engine.cameraFocus}
          speakingMeta={
            engine.eventTtsQueue.isPlayingEvent
              ? engine.eventTtsQueue.activeItem?.meta || null
              : null
          }
          isTtsSpeaking={engine.ttsStatus.active}
          onMoveWaypoint={engine.handleMoveWaypoint}
          onMoveWaypointsBatch={engine.handleMoveWaypointsBatch}
          onAddDesk={engine.handleAddDesk}
          onRemoveDesk={engine.handleRemoveDesk}
          onRemoveDesksByIds={engine.handleRemoveDesksByIds}
          onUpdateHudBox={engine.handleUpdateHudBox}
          onUpdateZoneBounds={engine.handleUpdateZoneBounds}
          classBoardState={engine.classBoardState}
        />
      )}

      {/* Right Area: Clean Collapsible Dev Studio */}
      {studioOpen && (
        <DevStudio
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onCloseStudio={() => setStudioOpen(false)}
          isLocalTabMuted={engine.isLocalTabMuted}
          onToggleLocalMute={engine.handleToggleLocalMute}
          wsStatus={engine.wsStatus}
          peerCounts={engine.peerCounts}
          onConnectWs={engine.connectWs}
          config={engine.config}
          onUpdateConfig={engine.handleUpdateConfig}
          onUpdateGrid={engine.handleUpdateGrid}
          onAddDesk={engine.handleAddDesk}
          onRemoveDesk={engine.handleRemoveDesk}
          onMoveWaypointsBatch={engine.handleMoveWaypointsBatch}
          onUpdateHudLayout={engine.handleUpdateHudLayout}
          realCount={engine.realCount}
          botCount={engine.botCount}
          queueCount={engine.queueCount}
          waitingQueue={engine.waitingQueue}
          grandEventProgress={engine.grandEventProgress}
          ttsStatus={engine.ttsStatus}
          onSpawnRandom={engine.handleSpawnRandom}
          onSpawnBatch={engine.handleSpawnBatch}
          onLeaveAll={engine.handleLeaveAll}
          onSpawnCustom={engine.handleSpawnCustom}
          onPlayBell={engine.handlePlayBell}
          onPlayWoodenFish={engine.handlePlayWoodenFish}
          onPanicMute={engine.handlePanicMute}
          onTestTTS={engine.handleTestTTS}
          onSpeakHostLiveText={engine.handleSpeakHostLiveText}
          onNextDharmaArticle={engine.handleNextDharmaArticle}
          onTriggerLike={engine.handleTriggerLike}
          onTriggerFollow={engine.handleTriggerFollow}
          onTriggerGrandEvent={engine.handleTriggerGrandEvent}
          onTriggerGiftCombo={engine.handleTriggerGiftCombo}
          onTriggerClassroomGift={(
            rawGiftName,
            coins,
            customUsername,
            customAvatarUrl,
            preferSeatedIfBlank,
            comboCount
          ) =>
            engine.handleTriggerClassroomGift({
              giftName: rawGiftName,
              coins,
              username: customUsername,
              avatarUrl: customAvatarUrl,
              preferSeatedIfBlank,
              comboCount,
            })
          }
          pilgrims={engine.pilgrims}
          doorCrowd={engine.doorCrowd}
          npcNames={engine.npcNames}
          npcPrayers={engine.npcPrayers}
          npcAvatars={engine.npcAvatars}
          controlledNpcRole={engine.controlledNpcRole}
          onToggleControlNpc={engine.handleToggleControlNpc}
          onSetNpcManualMove={engine.handleSetNpcManualMove}
          onSendControlledStudentComment={engine.handleSendControlledStudentComment}
          onUpdateNpcNames={engine.handleUpdateNpcNames}
          onResetNpcNames={engine.handleResetNpcNames}
          onUpdateNpcPrayers={engine.handleUpdateNpcPrayers}
          onResetNpcPrayers={engine.handleResetNpcPrayers}
          onUpdateNpcAvatars={engine.handleUpdateNpcAvatars}
          onResetNpcAvatars={engine.handleResetNpcAvatars}
          onRandomizeActiveNpcAvatars={engine.handleRandomizeActiveNpcAvatars}
          safetyActionMode={engine.safetyActionMode}
          safetyCategories={engine.safetyCategories}
          customWords={engine.customWords}
          safetyLogs={engine.safetyLogs}
          onChangeSafetyMode={engine.setSafetyActionMode}
          onToggleSafetyCategory={engine.handleToggleSafetyCategory}
          onAddCustomWords={engine.handleAddCustomWords}
          onRemoveCustomWord={engine.handleRemoveCustomWord}
          onResetCustomWords={engine.handleResetCustomWords}
          onClearSafetyLogs={engine.clearSafetyLogs}
          onSpawnTrollTest={engine.handleSpawnTrollTest}
          vipSlots={engine.vipSlots}
          normalSlots={engine.normalSlots}
          customAssets={engine.customAssets}
          onUploadAsset={engine.handleUploadAsset}
          onResetAsset={engine.handleResetAsset}
          onSaveBackupJson={engine.handleSaveBackupJson}
          onLoadBackupJson={engine.handleLoadBackupJson}
          lotusDonorsCount={engine.lotusDonors.length}
          onClearLotusDonors={engine.handleClearLotusDonors}
          dailyRecords={engine.dailyRecords}
          onResetDailyRecords={engine.handleResetDailyRecords}
          eventTtsQueue={engine.eventTtsQueue}
          onClearEventTtsQueue={engine.handleClearEventTtsQueue}
          cameraFocus={engine.cameraFocus}
          cameraQueue={engine.cameraQueue}
          onSkipCameraTarget={engine.handleSkipCameraTarget}
          onResetCameraView={engine.handleResetCameraView}
          onClearCameraQueue={engine.handleClearCameraQueue}
          onRemoveCameraQueueItem={engine.handleRemoveCameraQueueItem}
          onFocusPilgrimNow={engine.handleFocusPilgrimNow}
          onPushFullSyncToLive={engine.handlePushFullSyncToLive}
          classBoardState={engine.classBoardState}
          onToggleClassBoardRun={engine.handleToggleClassBoardRun}
          onRestartClassBoardFromStart={engine.handleRestartClassBoardFromStart}
          onRunNoticeBoard={engine.handleRunNoticeBoard}
          onNextClassBoardQuestion={engine.handleNextClassBoardQuestion}
          onSimulateQuizAnswer={engine.handleSimulateQuizAnswer}
          onEnqueueWaitingStudent={engine.handleEnqueueWaitingStudent}
          onRemoveWaitingQueueItem={engine.handleRemoveWaitingQueueItem}
          onClearWaitingQueue={engine.handleClearWaitingQueue}
          onClearNpcWaitingQueue={engine.handleClearNpcWaitingQueue}
          onAdmitNextWaitingStudent={engine.handleAdmitNextWaitingStudent}
          zombieEventState={engine.zombieEventState}
          onTriggerZombieEvent={engine.handleTriggerZombieEvent}
          onStopZombieEvent={engine.handleStopZombieEvent}
          onKillZombieImmediately={engine.handleKillZombieImmediately}
          onTestZombieAttack={engine.handleTestZombieAttack}
          compactRemoteStage={compactRemoteStage}
          onToggleCompactRemoteStage={handleToggleCompactRemoteStage}
        />
      )}
    </div>
  );
}

