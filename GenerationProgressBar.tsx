/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { BACK_COVER_PAGE, ComicFace, TOTAL_PAGES } from './types';

interface GenerationProgressBarProps {
    comicFaces: ComicFace[];
    visible: boolean;
    onGoToDecision?: () => void;
}

export const GenerationProgressBar: React.FC<GenerationProgressBarProps> = ({ comicFaces, visible, onGoToDecision }) => {
    if (!visible) return null;

    const totalPagesCount = TOTAL_PAGES + 1; // Cover (0) + Story (1..10) + Back Cover (11)
    const slots = Array.from({ length: totalPagesCount }, (_, idx) =>
        comicFaces.find(f => f.pageIndex === idx)
    );

    const completedCount = slots.filter(f => f && !f.isLoading).length;
    const inProgressFaces = slots.filter((f): f is ComicFace => Boolean(f && f.isLoading));
    const isGenerating = inProgressFaces.length > 0;
    const isComplete = completedCount === totalPagesCount;
    const awaitingDecision = !isGenerating && !isComplete && comicFaces.some(f => f.isDecisionPage && !f.resolvedChoice);

    // Calculate smooth progress: finished = 1, narrative ready (inking) = 0.5, active scripting = 0.15
    const activeStoryFace = inProgressFaces.find(f => (f.pageIndex ?? 0) >= 1);
    const coverLoading = inProgressFaces.some(f => f.pageIndex === 0);

    let fractionalUnits = completedCount;
    if (coverLoading) {
        fractionalUnits += 0.25;
    }
    if (activeStoryFace) {
        fractionalUnits += activeStoryFace.narrative ? 0.5 : 0.15;
    }

    const rawPercent = Math.round((Math.min(fractionalUnits, totalPagesCount) / totalPagesCount) * 100);
    const percent = isComplete ? 100 : Math.min(99, rawPercent);

    let statusText = 'READY TO READ';
    if (isComplete) {
        statusText = 'ISSUE #1 COMPLETE — ALL PAGES READY';
    } else if (awaitingDecision) {
        statusText = 'CHOOSE ON PAGE 3 TO PRINT MORE PAGES';
    } else if (isGenerating) {
        if (coverLoading && !activeStoryFace) {
            statusText = 'INKING COVER...';
        } else if (activeStoryFace) {
            const pageLabel = activeStoryFace.type === 'back_cover' || activeStoryFace.pageIndex === BACK_COVER_PAGE
                ? 'BACK COVER'
                : `PAGE ${activeStoryFace.pageIndex}`;
            statusText = activeStoryFace.narrative
                ? `INKING ${pageLabel}...`
                : `WRITING ${pageLabel}...`;
        } else {
            statusText = 'PRINTING PAGES...';
        }
    }

    return (
        <div
            className="fixed top-2.5 sm:top-3 left-1/2 -translate-x-1/2 z-[150] w-[min(94vw,560px)] pointer-events-none select-none"
            role="progressbar"
            aria-label="Comic page generation progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
        >
            <style>{`
                @keyframes comic-bar-stripes {
                    0% { background-position: 0 0; }
                    100% { background-position: 28px 0; }
                }
                .comic-stripes-active {
                    background-image: repeating-linear-gradient(
                        -45deg,
                        rgba(255, 255, 255, 0.28),
                        rgba(255, 255, 255, 0.28) 7px,
                        transparent 7px,
                        transparent 14px
                    );
                    background-size: 28px 28px;
                    animation: comic-bar-stripes 0.8s linear infinite;
                }
            `}</style>

            <div className="bg-white border-[3px] border-black shadow-[4px_4px_0px_#000] px-3 py-1.5 sm:px-4 sm:py-2 pointer-events-auto">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <svg
                            viewBox="0 0 24 24"
                            className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${
                                isComplete ? 'text-green-600' : isGenerating ? 'text-red-600 animate-pulse' : 'text-blue-600'
                            }`}
                            fill="currentColor"
                            aria-hidden="true"
                        >
                            {isComplete ? (
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            ) : (
                                <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
                            )}
                        </svg>
                        <span className="font-comic text-sm sm:text-lg tracking-wider text-black truncate">
                            {statusText}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {awaitingDecision && onGoToDecision && (
                            <button
                                type="button"
                                onClick={onGoToDecision}
                                className="font-comic text-xs sm:text-sm tracking-wider px-2 py-0.5 border-2 border-black bg-yellow-400 hover:bg-yellow-300 text-black cursor-pointer uppercase"
                            >
                                GO TO PAGE 3
                            </button>
                        )}
                        <span className="font-comic text-sm sm:text-base tracking-wide text-gray-800">
                            {completedCount}/{totalPagesCount} PAGES
                        </span>
                        <span
                            className={`font-comic text-xs sm:text-sm tracking-wider px-2 py-0.5 border-2 border-black ${
                                isComplete ? 'bg-green-400 text-black' : 'bg-black text-yellow-400'
                            }`}
                        >
                            {percent}%
                        </span>
                    </div>
                </div>

                {/* Progress Track */}
                <div className="relative w-full h-3.5 sm:h-4 bg-gray-200 border-2 border-black overflow-hidden mt-1">
                    {/* Continuous Fill */}
                    <div
                        className={`h-full transition-all duration-500 ease-out relative ${
                            isComplete
                                ? 'bg-green-500'
                                : awaitingDecision
                                ? 'bg-blue-500'
                                : 'bg-yellow-400'
                        }`}
                        style={{ width: `${percent}%` }}
                    >
                        {isGenerating && (
                            <div className="absolute inset-0 comic-stripes-active" />
                        )}
                    </div>

                    {/* Page Segment Dividers */}
                    <div
                        className="absolute inset-0 grid pointer-events-none"
                        style={{ gridTemplateColumns: `repeat(${totalPagesCount}, minmax(0, 1fr))` }}
                    >
                        {slots.map((face, idx) => {
                            const isSlotLoading = Boolean(face?.isLoading);
                            const slotLabel = idx === 0 ? 'Cover' : idx === BACK_COVER_PAGE ? 'Back Cover' : `Page ${idx}`;
                            return (
                                <div
                                    key={idx}
                                    title={`${slotLabel}: ${face ? (face.isLoading ? (face.narrative ? 'Inking' : 'Writing') : 'Ready') : 'Pending'}`}
                                    className={`h-full ${idx < totalPagesCount - 1 ? 'border-r border-black/30' : ''} ${
                                        isSlotLoading ? 'bg-yellow-300/35 animate-pulse' : ''
                                    }`}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
