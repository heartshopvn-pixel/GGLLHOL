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

  const engine = useClassroomEngine();

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

      {/* Left Area: 9:16 Chánh Điện Stage for OBS Stream */}
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
        />
      )}
    </div>
  );
}

